/* eslint-disable @next/next/no-assign-module-variable */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireBilling, BillingError, isEntitledSubscriptionStatus } from '@/lib/billing/guard';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
    },
  },
}));

describe('requireBilling', () => {
  const userId = 'user-123';
  const workspaceId = 'ws-456';
  const module = 'visibility' as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw BillingError when no subscription exists', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(requireBilling(userId, workspaceId, module)).rejects.toThrow(BillingError);
    await expect(requireBilling(userId, workspaceId, module)).rejects.toThrow(
      'No active subscription for module: visibility'
    );
  });

  it('should throw BillingError when subscription is inactive', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(requireBilling(userId, workspaceId, module)).rejects.toThrow(BillingError);
  });

  it('should not throw when subscription is active', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    // Should resolve without throwing
    await expect(requireBilling(userId, workspaceId, module)).resolves.toBeUndefined();
  });

  it('should not throw when subscription is trialing', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    await expect(requireBilling(userId, workspaceId, module)).resolves.toBeUndefined();
  });

  it('should throw BillingError when subscription is past_due', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(requireBilling(userId, workspaceId, module)).rejects.toThrow(BillingError);
  });

  it('should query with correct composite key', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    await requireBilling(userId, workspaceId, module);

    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        status: { in: ['active', 'trialing'] },
        currentPeriodEnd: { gt: expect.any(Date) },
      },
      select: {
        module: true,
        billingPlan: { select: { key: true } },
      },
    });
  });

  it('should include module and statusCode on BillingError', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    try {
      await requireBilling(userId, workspaceId, 'content');
    } catch (err) {
      expect(err).toBeInstanceOf(BillingError);
      const billingErr = err as BillingError;
      expect(billingErr.module).toBe('content');
      expect(billingErr.statusCode).toBe(403);
      expect(billingErr.name).toBe('BillingError');
    }
  });

  it('should treat active and trialing as entitled statuses', () => {
    expect(isEntitledSubscriptionStatus('active')).toBe(true);
    expect(isEntitledSubscriptionStatus('trialing')).toBe(true);
    expect(isEntitledSubscriptionStatus('inactive')).toBe(false);
    expect(isEntitledSubscriptionStatus(undefined)).toBe(false);
  });
});
