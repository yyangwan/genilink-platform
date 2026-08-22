import { getWorkspaceBillingAccess } from '@/lib/billing/access';
import type { WorkspaceBillingAccess } from '@/lib/billing/access';
import { hasCapabilityLevel } from '@/lib/billing/tiers';
import type { BillingCapabilityKey, CapabilityLevel } from '@/lib/billing/tiers';
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

export class BillingCapabilityError extends Error {
  statusCode = 403;

  constructor(
    public readonly capability: BillingCapabilityKey,
    public readonly requiredLevel: CapabilityLevel,
    public readonly actualLevel: CapabilityLevel,
  ) {
    super(`Subscription capability required: ${capability}`);
    this.name = 'BillingCapabilityError';
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
): Promise<WorkspaceBillingAccess> {
  if (process.env.NODE_ENV === 'development' || process.env.BILLING_DISABLED === 'true') {
    const definition = (await import('@/lib/billing/tiers')).getTierDefinition('max');
    return { tier: 'max', modules: definition.modules, limits: definition.limits, capabilities: definition.capabilities };
  }

  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  if (!access.modules.includes(module)) {
    throw new BillingError(module);
  }
  return access;
}

export function requireBillingCapability(
  access: WorkspaceBillingAccess,
  capability: BillingCapabilityKey,
  requiredLevel: CapabilityLevel = 'basic',
): void {
  const actualLevel = access.capabilities[capability];
  if (!hasCapabilityLevel(actualLevel, requiredLevel)) {
    throw new BillingCapabilityError(capability, requiredLevel, actualLevel);
  }
}
