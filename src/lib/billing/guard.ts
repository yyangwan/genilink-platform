import { getWorkspaceBillingAccess } from '@/lib/billing/access';
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

const ENTITLED_STATUSES = new Set(['active', 'trialing']);

export function isEntitledSubscriptionStatus(status: string | null | undefined): boolean {
  return status ? ENTITLED_STATUSES.has(status) : false;
}

export async function requireBilling(
  userId: string,
  workspaceId: string,
  module: ModuleType
): Promise<void> {
  if (process.env.NODE_ENV === 'development' || process.env.BILLING_DISABLED === 'true') return;

  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  if (!access.modules.includes(module)) {
    throw new BillingError(module);
  }
}
