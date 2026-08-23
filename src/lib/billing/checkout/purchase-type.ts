// Server-side purchase type detection (spec §7.7).
// The client never specifies purchaseType or prices.

import { getTierFromPlanKey, isUpgrade } from '@/lib/billing/tiers';
import type { PurchaseType } from '@/lib/billing/types';

export type PurchaseTypeResolution =
  | { purchaseType: 'new'; sourceSubscriptionId: null }
  | { purchaseType: 'upgrade'; sourceSubscriptionId: string }
  | {
      purchaseType: 'manual_renewal';
      sourceSubscriptionId: string;
      currentPeriodEnd: Date;
    }
  | {
      error: 'PLAN_DOWNGRADE_NOT_SUPPORTED' | 'AUTO_RENEW_ALREADY_ENABLED';
    };

export type CurrentSubscriptionSnapshot = {
  id: string;
  billingPlanKey: string | null;
  billingCycle: string;
  status: string;
  autoRenew: boolean;
  currentPeriodEnd: Date;
} | null;

/**
 * Determine the purchase type from the current effective subscription and the
 * target plan (spec §7.7 table). An "effective" subscription is active/past_due
 * with a future period end; the caller loads and passes it in.
 */
export function resolvePurchaseType(params: {
  currentSubscription: CurrentSubscriptionSnapshot;
  targetPlanKey: string;
  now: Date;
}): PurchaseTypeResolution {
  const current = params.currentSubscription;
  const targetTier = getTierFromPlanKey(params.targetPlanKey);

  if (!current || current.currentPeriodEnd <= params.now) {
    return { purchaseType: 'new', sourceSubscriptionId: null };
  }

  const currentTier = getTierFromPlanKey(current.billingPlanKey ?? '');

  // Identical plan key -> manual renewal, but only when auto-renew is off.
  if (current.billingPlanKey === params.targetPlanKey) {
    if (current.autoRenew) {
      return { error: 'AUTO_RENEW_ALREADY_ENABLED' };
    }
    return {
      purchaseType: 'manual_renewal',
      sourceSubscriptionId: current.id,
      currentPeriodEnd: current.currentPeriodEnd,
    };
  }

  if (targetTier && currentTier) {
    // Higher tier is an upgrade (spec §7.7).
    if (isUpgrade(currentTier, targetTier)) {
      return { purchaseType: 'upgrade', sourceSubscriptionId: current.id };
    }
    if (currentTier === targetTier) {
      // Same tier: monthly -> yearly is an upgrade; yearly -> monthly is a
      // rejected downgrade (spec §3/§7.7).
      const targetCycle = params.targetPlanKey.endsWith('-yearly') ? 'yearly' : 'monthly';
      if (current.billingCycle === 'monthly' && targetCycle === 'yearly') {
        return { purchaseType: 'upgrade', sourceSubscriptionId: current.id };
      }
    }
    return { error: 'PLAN_DOWNGRADE_NOT_SUPPORTED' };
  }

  if (targetTier && !currentTier) {
    // Current subscription has no recognized tier (legacy) — treat suite plan
    // purchase as an upgrade replacing it.
    return { purchaseType: 'upgrade', sourceSubscriptionId: current.id };
  }

  return { error: 'PLAN_DOWNGRADE_NOT_SUPPORTED' };
}

/** Load the effective subscription for a module and map it to the snapshot. */
export async function loadCurrentSubscriptionSnapshot(
  prisma: {
    subscription: {
      findFirst: (args: unknown) => Promise<unknown>;
    };
  },
  params: { userId: string; workspaceId: string; module: string; now: Date },
): Promise<CurrentSubscriptionSnapshot> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      module: params.module,
      status: { in: ['active', 'past_due', 'trialing'] },
      currentPeriodEnd: { gt: params.now },
    },
    orderBy: { currentPeriodEnd: 'desc' },
    select: {
      id: true,
      billingCycle: true,
      status: true,
      autoRenew: true,
      currentPeriodEnd: true,
      billingPlan: { select: { key: true } },
    },
  });

  if (!subscription) return null;

  const row = subscription as {
    id: string;
    billingCycle: string;
    status: string;
    autoRenew?: boolean | null;
    currentPeriodEnd: Date;
    billingPlan?: { key?: string } | null;
  };

  return {
    id: row.id,
    billingPlanKey: row.billingPlan?.key ?? null,
    billingCycle: row.billingCycle,
    status: row.status,
    autoRenew: row.autoRenew ?? false,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}
