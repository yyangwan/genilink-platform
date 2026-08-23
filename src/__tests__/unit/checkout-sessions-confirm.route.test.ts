import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com', name: 'Test' } }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

const wechatAdapterMock = vi.hoisted(() => ({
  provider: 'wechatpay' as const,
  getCapabilities: vi.fn(() => ({ oneTimePayment: true, recurringPayment: false, payAndSign: false })),
  createOneTimePayment: vi.fn(),
  closePayment: vi.fn(),
  queryPayment: vi.fn(),
  verifyWebhook: vi.fn(),
}));

vi.mock('@/lib/billing/payments/wechatpay', () => ({ wechatPayAdapter: wechatAdapterMock }));

import { prisma } from '@/lib/db';
import { POST } from '@/app/api/billing/checkout-sessions/[sessionId]/confirm/route';

const PLAN = {
  id: 'plan-1',
  key: 'suite-pro-yearly',
  module: 'suite',
  billingCycle: 'yearly',
  name: '专业版年付',
  priceCents: 399900,
  currency: 'CNY',
  isActive: true,
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    billingPlanId: 'plan-1',
    status: 'ready',
    currency: 'CNY',
    purchaseType: 'new',
    subtotalCents: 399900,
    discountCents: 0,
    amountDueCents: 399900,
    renewalAmountCents: 399900,
    planSnapshot: { key: 'suite-pro-yearly', name: '专业版年付', tier: 'pro', billingCycle: 'yearly', module: 'suite', priceCents: 399900, currency: 'CNY' },
    discountSnapshot: null,
    couponId: null,
    coupon: null,
    autoRenew: false,
    paymentAgreement: null,
    paymentOrders: [],
    redemption: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    completedAt: null,
    billingPlan: PLAN,
    ...overrides,
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/billing/checkout-sessions/session-1/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function routeCtx() {
  return { params: Promise.resolve({ sessionId: 'session-1' }) };
}

describe('POST confirm (spec §8.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wechatAdapterMock.getCapabilities.mockReturnValue({ oneTimePayment: true, recurringPayment: false, payAndSign: false });
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.checkoutSession.update).mockResolvedValue(makeSession({ status: 'processing' }) as never);
    vi.mocked(prisma.checkoutSession.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.paymentOrder.create).mockResolvedValue({
      id: 'order-1',
      provider: 'wechatpay',
      status: 'pending',
      attemptNumber: 1,
      expiredAt: null,
      failureCode: null,
      failureMessage: null,
      metadata: {},
    } as never);
    vi.mocked(prisma.paymentOrder.update).mockImplementation(async ({ data }) => ({
      id: 'order-1',
      provider: 'wechatpay',
      status: (data as { status?: string }).status ?? 'opened',
      attemptNumber: 1,
      expiredAt: (data as { expiredAt?: Date }).expiredAt ?? null,
      failureCode: null,
      failureMessage: null,
      metadata: (data as { metadata?: unknown }).metadata ?? {},
    }) as never);
    vi.mocked(prisma.paymentAgreement.upsert).mockResolvedValue({ id: 'agr-1', status: 'pending' } as never);
    vi.mocked(prisma.coupon.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.couponRedemption.findUnique).mockResolvedValue(null as never);
    wechatAdapterMock.createOneTimePayment.mockResolvedValue({
      presentation: 'qr_code',
      codeUrl: 'weixin://wxpay/test',
      providerSessionId: 'order-1',
    });
  });

  it('opens a QR payment attempt for wechatpay', async () => {
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.checkoutSession).toMatchObject({ id: 'session-1' });
    expect(data.payment).toMatchObject({
      provider: 'wechatpay',
      status: 'opened',
      presentation: 'qr_code',
      codeUrl: 'weixin://wxpay/test',
    });
  });

  it('rejects autoRenew when the channel lacks recurring capability (spec §3 degradation)', async () => {
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: true }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('AUTO_RENEW_NOT_SUPPORTED');
  });

  it('requires an agreement version when autoRenew is enabled on a recurring channel', async () => {
    wechatAdapterMock.getCapabilities.mockReturnValue({ oneTimePayment: true, recurringPayment: true, payAndSign: true });
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: true }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('AGREEMENT_VERSION_REQUIRED');
  });

  it('rejects expired sessions with 409', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 60_000) }) as never,
    );
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CHECKOUT_SESSION_EXPIRED');
  });

  it('returns 404 when the session belongs to another workspace', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ workspaceId: 'other' }) as never,
    );
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(404);
  });

  it('rejects when the stored quote no longer matches the server quote (spec §8.5)', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ amountDueCents: 1, subtotalCents: 1 }) as never,
    );
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('QUOTE_MISMATCH');
  });

  it('returns the in-flight attempt instead of double-charging on re-confirm', async () => {
    const openAttempt = {
      id: 'order-0',
      provider: 'wechatpay',
      status: 'opened',
      attemptNumber: 1,
      expiredAt: new Date(),
      failureCode: null,
      failureMessage: null,
      metadata: { presentation: 'qr_code', codeUrl: 'weixin://wxpay/first' },
    };
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({
        status: 'processing',
        paymentOrders: [openAttempt],
      }) as never,
    );
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k2' }),
      routeCtx(),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.payment.id).toBe('order-0');
    expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
  });

  it('closes the old attempt and creates attemptNumber + 1 on forceNewAttempt (spec §10.2)', async () => {
    const staleAttempt = {
      id: 'order-0',
      provider: 'wechatpay',
      status: 'opened',
      attemptNumber: 1,
      expiredAt: new Date(Date.now() - 1000),
      failureCode: null,
      failureMessage: null,
      metadata: { presentation: 'qr_code', codeUrl: 'weixin://wxpay/stale' },
    };
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({
        status: 'processing',
        paymentOrders: [staleAttempt],
      }) as never,
    );
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false, forceNewAttempt: true }, { 'Idempotency-Key': 'k3' }),
      routeCtx(),
    );
    expect(response.status).toBe(200);
    // Old attempt canceled at the channel + locally, new attempt created.
    expect(wechatAdapterMock.closePayment).toHaveBeenCalledWith({ orderId: 'order-0' });
    expect(prisma.paymentOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attemptNumber: 2, checkoutSessionId: 'session-1' }) }),
    );
  });

  it('returns the session to ready when the channel call fails so the user can switch channels (spec §13.1)', async () => {
    wechatAdapterMock.createOneTimePayment.mockRejectedValue(new Error('channel down'));
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k4' }),
      routeCtx(),
    );
    expect(response.status).toBe(502);
    expect(prisma.paymentOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(prisma.checkoutSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ready' } }),
    );
  });

  it('replays the stored attempt for the same confirm idempotency key', async () => {
    const { requestHash } = await import('@/lib/billing/idempotency');
    vi.mocked(prisma.paymentOrder.findUnique).mockImplementation(async ({ where }: { where: { idempotencyKey: string } }) => {
      if (where.idempotencyKey === 'confirm:session-1:k1') {
        return {
          id: 'order-1',
          provider: 'wechatpay',
          status: 'opened',
          attemptNumber: 1,
          expiredAt: new Date(),
          failureCode: null,
          failureMessage: null,
          metadata: { presentation: 'qr_code', codeUrl: 'weixin://wxpay/first' },
          idempotencyRequestHash: requestHash({ provider: 'wechatpay', autoRenew: false, agreementAcceptedVersion: null }),
        } as never;
      }
      return null as never;
    });
    const response = await POST(
      postRequest({ provider: 'wechatpay', autoRenew: false }, { 'Idempotency-Key': 'k1' }),
      routeCtx(),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.payment.id).toBe('order-1');
    expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
  });
});
