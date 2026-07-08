import { prisma } from '@/lib/db';

/**
 * Get list of active module subscriptions for a user/workspace.
 * Used to set the genilink-modules cookie for middleware checks.
 */
export async function getActiveModules(userId: string, workspaceId: string): Promise<string[]> {
  if (process.env.BILLING_DISABLED === 'true') {
    return ['visibility', 'content'];
  }

  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      workspaceId,
      status: {
        in: ['active', 'trialing'],
      },
    },
    select: { module: true },
  });

  return subs.map((s) => s.module);
}
