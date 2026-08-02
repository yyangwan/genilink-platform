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
      { module: 'suite', billingPlan: { key: 'suite-pro-monthly' } },
    ]);

    const modules = await getActiveModules('user-1', 'workspace-1');

    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        status: {
          in: ['active', 'trialing'],
        },
        currentPeriodEnd: { gt: expect.any(Date) },
      },
      select: {
        module: true,
        billingPlan: { select: { key: true } },
      },
    });
    expect(modules).toEqual(['visibility', 'content']);
  });
});
