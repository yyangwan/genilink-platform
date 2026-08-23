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
      { module: 'suite', status: 'active', currentPeriodEnd: new Date('2026-12-31'), gracePeriodEnd: null, billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    // Should resolve without throwing
    await expect(requireBilling(userId, workspaceId, module)).resolves.toMatchObject({ tier: 'lite' });
  });

  it('should not throw when subscription is trialing', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', status: 'trialing', currentPeriodEnd: new Date('2026-12-31'), gracePeriodEnd: null, billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    await expect(requireBilling(userId, workspaceId, module)).resolves.toMatchObject({ tier: 'lite' });
  });

  it('keeps access during the past_due grace window but not after it (remediation §4.7)', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', status: 'past_due', currentPeriodEnd: new Date('2026-08-20'), gracePeriodEnd: new Date(Date.now() + 86_400_000), billingPlan: { key: 'suite-lite-monthly' } },
    ]);
    await expect(requireBilling(userId, workspaceId, module)).resolves.toMatchObject({ tier: 'lite' });

    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', status: 'past_due', currentPeriodEnd: new Date('2026-08-20'), gracePeriodEnd: new Date(Date.now() - 86_400_000), billingPlan: { key: 'suite-lite-monthly' } },
    ]);
    await expect(requireBilling(userId, workspaceId, module)).rejects.toThrow(BillingError);
  });

  it('should query with correct composite key', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', status: 'active', currentPeriodEnd: new Date('2026-12-31'), gracePeriodEnd: null, billingPlan: { key: 'suite-lite-monthly' } },
    ]);

    await requireBilling(userId, workspaceId, module);

    // past_due rows are fetched and entitlement-filtered in code
    // (remediation §4.7) instead of being dropped by the query.
    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      select: {
        module: true,
        billingPlan: { select: { key: true } },
        status: true,
        currentPeriodEnd: true,
        gracePeriodEnd: true,
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
