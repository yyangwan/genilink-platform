import type { WorkspaceBillingAccess } from '@/lib/billing/access';
import { getTierDefinition } from '@/lib/billing/tiers';

const maxTier = getTierDefinition('max');

export const maxBillingAccess: WorkspaceBillingAccess = {
  tier: 'max',
  modules: maxTier.modules,
  limits: maxTier.limits,
  capabilities: maxTier.capabilities,
};
