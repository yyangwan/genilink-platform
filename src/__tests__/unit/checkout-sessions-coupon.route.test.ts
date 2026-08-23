import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com', name: 'Test' } }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

import { prisma } from '@/lib/db';
import { PUT, DELETE } from '@/app/api/billing/checkout-sessions/[sessionId]/coupon/route';

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

const PROMOTION = {
  id: 'promo-1',
  name: '首年优惠',
  discountType: 'percentage',
  discountValue: 2000,
  duration: 'once',
  durationCycles: null,
  minimumAmountCents: null,
  maximumDiscountCents: null,
  eligiblePlanKeys: null,
  eligibleBillingCycles: null,
  newCustomersOnly: false,
  maxRedemptions: null,
  maxPerUser: 1,
  maxPerWorkspace: 1,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: null,
  isActive: true,
};

const COUPON = {
  id: 'coupon-1',
  promotionId: 'promo-1',
  code: 'WELCOME20',
  isActive: true,
  startsAt: null,
  endsAt: null,
  promotion: PROMOTION,
};

const futureDate = () => new Date(Date.now() + 30 * 60_000);

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
    expiresAt: futureDate(),
    completedAt: null,
    billingPlan: PLAN,
    ...overrides,
  };
}

function putRequest(sessionId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/billing/checkout-sessions/${sessionId}/coupon`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(sessionId: string) {
  return new NextRequest(`http://localhost/api/billing/checkout-sessions/${sessionId}/coupon`, {
    method: 'DELETE',
  });
}

function routeCtx(sessionId = 'session-1') {
  return { params: Promise.resolve({ sessionId }) };
}

describe('coupon endpoints (spec §8.3/§8.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.checkoutSession.update).mockResolvedValue(makeSession({ couponId: 'coupon-1', coupon: COUPON, discountCents: 79980, amountDueCents: 319920 }) as never);
    vi.mocked(prisma.coupon.findUnique).mockResolvedValue(COUPON as never);
    vi.mocked(prisma.couponRedemption.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.paymentOrder.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null as never);
  });

  it('PUT applies a coupon and returns the FULL updated quote (spec §8.3)', async () => {
    const response = await PUT(putRequest('session-1', { code: ' welcome20 ' }), routeCtx());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.checkoutSession.quote).toMatchObject({
      subtotalCents: 399900,
      discountCents: 79980,
      amountDueCents: 319920,
      renewalAmountCents: 399900,
    });
    expect(data.checkoutSession.coupon).toMatchObject({ code: 'WELCOME20' });
    // Coupon codes are normalized to uppercase (spec §15).
    expect(prisma.coupon.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'WELCOME20' } }));
  });

  it('PUT returns 404 when the session belongs to another user (spec §8.2 ownership)', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ userId: 'someone-else' }) as never,
    );
    const response = await PUT(putRequest('session-1', { code: 'WELCOME20' }), routeCtx());
    expect(response.status).toBe(404);
  });

  it('PUT rejects expired sessions with 409', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ expiresAt: new Date('2026-08-22T09:00:00.000Z') }) as never,
    );
    vi.mocked(prisma.checkoutSession.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.couponRedemption.updateMany).mockResolvedValue({ count: 0 } as never);
    const response = await PUT(putRequest('session-1', { code: 'WELCOME20' }), routeCtx());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CHECKOUT_SESSION_EXPIRED');
  });

  it('PUT rejects sessions not in ready state', async () => {
    vi.mocked(prisma.checkoutSession.findUnique).mockResolvedValue(
      makeSession({ status: 'processing' }) as never,
    );
    const response = await PUT(putRequest('session-1', { code: 'WELCOME20' }), routeCtx());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CHECKOUT_SESSION_NOT_MODIFIABLE');
  });

  it('PUT surfaces COUPON_* eligibility errors', async () => {
    vi.mocked(prisma.couponRedemption.count).mockResolvedValue(1 as never); // per-user cap of 1 hit
    const response = await PUT(putRequest('session-1', { code: 'WELCOME20' }), routeCtx());
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('COUPON_ALREADY_USED');
  });

  it('DELETE removes the coupon and restores the full price', async () => {
    const response = await DELETE(deleteRequest('session-1'), routeCtx());
    expect(response.status).toBe(200);
    expect(prisma.checkoutSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ couponId: null, discountCents: 0, amountDueCents: 399900 }),
      }),
    );
  });
});
