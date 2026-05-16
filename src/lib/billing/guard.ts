import { prisma } from '@/lib/db';
import type { ModuleType } from '@/types/billing';

export class BillingError extends Error {
  module: ModuleType;
  statusCode: number;

  constructor(module: ModuleType) {
    super(`No active subscription for module: ${module}`);
    this.name = 'BillingError';
    this.module = module;
    this.statusCode = 403;
  }
}

export async function requireBilling(
  userId: string,
  workspaceId: string,
  module: ModuleType
): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: {
      userId_workspaceId_module: {
        userId,
        workspaceId,
        module,
      },
    },
  });

  if (!sub || sub.status !== 'active') {
    throw new BillingError(module);
  }
}
