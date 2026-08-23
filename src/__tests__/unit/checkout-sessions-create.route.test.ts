import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com', name: 'Test' } }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

import { prisma } from '@/lib/db';
import { POST } from '@/app/api/billing/checkout-sessions/route';
import { requestHash } from '@/lib/billing/idempotency';

const PLAN = {
  id: 'plan-1',
  key: 'suite-pro-yearly',
  module: 'suite',
  billingCycle: 'yearly',
  name: '专业版年付',
  description: null,
  priceCents: 399900,
  currency: 'CNY',
  provider: 'wechatpay',
  providerPriceId: null,
  checkoutUrl: null,
  isActive: true,
  sortOrder: 40,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const PLAN_MONTHLY = {
  ...PLAN,
  id: 'plan-2',
  key: 'suite-pro-monthly',
  billingCycle: 'monthly',
  name: '专业版月付',
  priceCents: 39900,
  sortOrder: 30,
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    idempotencyKey: 'key-1',
    idempotencyRequestHash: requestHash({ planKey: 'suite-pro-yearly', couponCode: null }),
    userId: 'user-1',
    workspaceId: 'workspace-1',
    billingPlanId: 'plan-1',
    sourceSubscriptionId: null,
    purchaseType: 'new',
    status: 'ready',
    currency: 'CNY',
    subtotalCents: 399900,
    discountCents: 0,
    amountDueCents: 399900,
    renewalAmountCents: 399900,
    planSnapshot: {
      key: 'suite-pro-yearly',
      name: '专业版年付',
      tier: 'pro',
      billingCycle: 'yearly',
      module: 'suite',
      priceCents: 399900,
      currency: 'CNY',
    },
    discountSnapshot: null,
    couponId: null,
    coupon: null,
    autoRenew: false,
    agreementAcceptedVersion: null,
    agreementAcceptedAt: null,
    agreementAcceptedIp: null,
    agreementAcceptedUa: null,
    paymentAgreement: null,
    paymentOrders: [],
    redemption: null,
    expiresAt: new Date('2026-08-22T10:30:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    billingPlan: PLAN,
    ...overrides,
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/billing/checkout-sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/billing/checkout-sessions (spec §8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.billingPlan.findUnique).mockImplementation((async ({ where }: { where: { key?: string } }) =>
      (where.key === 'suite-pro-monthly' ? PLAN_MONTHLY : PLAN)) as never,
    );
    vi.mocked(prisma.billingPlan.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.billingPlan.upsert).mockResolvedValue(PLAN as never);
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.checkoutSession.create).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.paymentOrder.count).mockResolvedValue(0 as never);
  });

  it('returns 201 with the session view on success', async () => {
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-yearly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.checkoutSession).toMatchObject({
      status: 'ready',
      purchaseType: 'new',
      plan: { key: 'suite-pro-yearly', tier: 'pro', billingCycle: 'yearly' },
      quote: { subtotalCents: 399900, discountCents: 0, amountDueCents: 399900 },
    });
    expect(data.checkoutSession.providerAvailability).toHaveProperty('wechatpay');
    expect(data.checkoutSession.providerAvailability).toHaveProperty('alipay');
  });

  it('requires an Idempotency-Key header', async () => {
    const response = await POST(makeRequest({ planKey: 'suite-pro-yearly' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/lib/auth/config');
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-yearly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('replays the stored session for the same key + body (spec §8)', async () => {
    // Owner-scoped lookup (remediation §4.8): the service queries by
    // (userId, workspaceId, idempotencyKey) via findFirst.
    vi.mocked(prisma.checkoutSession.findFirst).mockResolvedValueOnce(makeSession() as never);
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-yearly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(201);
    expect(prisma.checkoutSession.create).not.toHaveBeenCalled();
  });

  it('returns 409 IDEMPOTENCY_KEY_REUSED when the key matches but the body differs', async () => {
    vi.mocked(prisma.checkoutSession.findFirst).mockResolvedValueOnce(
      makeSession({ idempotencyRequestHash: requestHash({ planKey: 'other-plan' }) }) as never,
    );
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-yearly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('returns 404 for unknown plans', async () => {
    vi.mocked(prisma.billingPlan.findUnique).mockResolvedValue(null as never);
    const response = await POST(
      makeRequest({ planKey: 'nope' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('PLAN_NOT_FOUND');
  });

  it('returns 422 for downgrades (spec §7.7)', async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      id: 'sub-1',
      billingCycle: 'yearly',
      status: 'active',
      autoRenew: false,
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      billingPlan: { key: 'suite-pro-yearly' },
    } as never);
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-monthly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('PLAN_DOWNGRADE_NOT_SUPPORTED');
  });

  it('returns 409 when the same plan is re-purchased with auto-renew on (spec §7.7)', async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      id: 'sub-1',
      billingCycle: 'monthly',
      status: 'active',
      autoRenew: true,
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      billingPlan: { key: 'suite-pro-monthly' },
    } as never);
    const response = await POST(
      makeRequest({ planKey: 'suite-pro-monthly' }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('AUTO_RENEW_ALREADY_ENABLED');
  });

  it('rejects invalid request bodies with 400', async () => {
    const response = await POST(
      makeRequest({ unexpected: true }, { 'Idempotency-Key': 'key-1' }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');
  });
});
