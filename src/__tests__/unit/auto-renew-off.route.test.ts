import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com', name: 'Test' } }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

import { prisma } from '@/lib/db';
import { DELETE } from '@/app/api/billing/subscriptions/[subscriptionId]/auto-renew/route';

function routeCtx(subscriptionId = 'sub-1') {
  return { params: Promise.resolve({ subscriptionId }) };
}

function seedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    module: 'suite',
    status: 'active',
    billingCycle: 'yearly',
    autoRenew: true,
    cancelAtPeriodEnd: false,
    paymentAgreementId: 'agr-1',
    paymentAgreement: {
      id: 'agr-1',
      provider: 'wechatpay',
      status: 'active',
      providerAgreementId: null,
    },
    ...overrides,
  };
}

describe('DELETE /api/billing/subscriptions/[id]/auto-renew (spec §8.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(seedSubscription() as never);
    vi.mocked(prisma.subscription.update).mockResolvedValue(seedSubscription({ autoRenew: false, cancelAtPeriodEnd: true }) as never);
    vi.mocked(prisma.paymentAgreement.update).mockResolvedValue({ id: 'agr-1', status: 'revoked' } as never);
    vi.mocked(prisma.renewalAttempt.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
  });

  it('turns off auto-renew, flags cancelAtPeriodEnd and cancels pending attempts', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/billing/subscriptions/sub-1/auto-renew', { method: 'DELETE' }), routeCtx());
    expect(response.status).toBe(200);

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ autoRenew: false, cancelAtPeriodEnd: true }),
      }),
    );
    expect(prisma.renewalAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscriptionId: 'sub-1', status: { in: ['scheduled', 'notifying'] } }),
        data: { status: 'canceled' },
      }),
    );
  });

  it('returns 202 when channel revocation fails but keeps blocking new charges', async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(seedSubscription({
      paymentAgreement: {
        id: 'agr-1',
        provider: 'wechatpay',
        status: 'active',
        providerAgreementId: 'wx-agr-1',
      },
    }) as never);
    // v1: revokeAgreement throws NOT_CONFIGURED for every channel.
    const response = await DELETE(new NextRequest('http://localhost/api/billing/subscriptions/sub-1/auto-renew', { method: 'DELETE' }), routeCtx());
    // With an active provider agreement id, revocation is attempted and fails -> 202.
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.status).toBe('revoking');
    // Local state still flips off so no new charge is created.
    expect(prisma.subscription.update).toHaveBeenCalled();
  });

  it('returns 404 when the subscription belongs to another user', async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null as never);
    const response = await DELETE(new NextRequest('http://localhost/api/billing/subscriptions/sub-1/auto-renew', { method: 'DELETE' }), routeCtx());
    expect(response.status).toBe(404);
  });

  it('closes cleanly without an agreement (200)', async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(
      seedSubscription({ paymentAgreementId: null, paymentAgreement: null }) as never,
    );
    const response = await DELETE(new NextRequest('http://localhost/api/billing/subscriptions/sub-1/auto-renew', { method: 'DELETE' }), routeCtx());
    expect(response.status).toBe(200);
    expect(prisma.paymentAgreement.update).not.toHaveBeenCalled();
  });
});
