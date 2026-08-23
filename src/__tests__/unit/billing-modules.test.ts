import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getActiveModules } from '@/lib/billing/modules';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
    },
  },
}));

describe('getActiveModules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes trialing subscriptions when building the access cookie', async () => {
    (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { module: 'suite', status: 'trialing', currentPeriodEnd: new Date('2026-12-31'), gracePeriodEnd: null, billingPlan: { key: 'suite-pro-monthly' } },
    ]);

    const modules = await getActiveModules('user-1', 'workspace-1');

    // past_due rows are also fetched and entitlement-filtered in code
    // (remediation §4.7).
    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        status: {
          in: ['active', 'trialing', 'past_due'],
        },
      },
      select: {
        module: true,
        billingPlan: { select: { key: true } },
        status: true,
        currentPeriodEnd: true,
        gracePeriodEnd: true,
      },
    });
    expect(modules).toEqual(['visibility', 'content']);
  });
});
