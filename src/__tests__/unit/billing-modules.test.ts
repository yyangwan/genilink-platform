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
      { module: 'visibility' },
      { module: 'content' },
    ]);

    const modules = await getActiveModules('user-1', 'workspace-1');

    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        status: {
          in: ['active', 'trialing'],
        },
      },
      select: { module: true },
    });
    expect(modules).toEqual(['visibility', 'content']);
  });
});
