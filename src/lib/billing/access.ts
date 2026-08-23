import { prisma } from '@/lib/db';
import type { ModuleType, SubscriptionTier } from '@/types/billing';
import {
  getTierDefinition,
  getTierFromPlanKey,
  highestTier,
} from '@/lib/billing/tiers';

type AccessSubscription = {
  module: string;
  billingPlan?: { key: string } | null;
};

export interface WorkspaceBillingAccess {
  tier: SubscriptionTier | null;
  modules: ModuleType[];
  limits: ReturnType<typeof getTierDefinition>['limits'];
  capabilities: ReturnType<typeof getTierDefinition>['capabilities'];
}

const FREE_LIMITS: ReturnType<typeof getTierDefinition>['limits'] = {
  projects: 1,
  members: 1,
  brands: 1,
  competitors: 1,
  promptsPerProject: 10,
  websiteAnalysesPerMonth: 3,
  visibilityAuditsPerMonth: 1,
  scheduledAudits: 0,
  compareRunsPerMonth: 0,
  pdfExportsPerMonth: 0,
  contentGenerationsPerMonth: 0,
  contentOptimizationsPerMonth: 0,
  seoOptimizationsPerMonth: 0,
  contentScoresPerMonth: 0,
  calendarItemsPerMonth: 0,
  brandVoices: 0,
  contentTemplates: 0,
};

const FREE_CAPABILITIES: ReturnType<typeof getTierDefinition>['capabilities'] = {
  auditReport: 'none',
  trendHistoryDays: 0,
  optimizationAdvice: 'none',
  competitorComparison: 'none',
  contentInsights: 'none',
  strategicIntelligence: 'none',
  sourceAuthority: 'none',
  structureEvolution: 'none',
  competitorPositioning: 'none',
  contentCalendar: 'none',
  platformConfig: 'none',
  support: 'none',
};

export function resolveBillingAccess(subscriptions: AccessSubscription[]): WorkspaceBillingAccess {
  const tier = highestTier(
    subscriptions.map((subscription) => getTierFromPlanKey(subscription.billingPlan?.key)),
  );

  const tierModules = tier ? getTierDefinition(tier).modules : [];
  return {
    tier,
    modules: tierModules,
    limits: tier ? getTierDefinition(tier).limits : FREE_LIMITS,
    capabilities: tier ? getTierDefinition(tier).capabilities : FREE_CAPABILITIES,
  };
}

// ─── Unified entitlement (remediation §4.7) ──────────────────────────────────

export type SubscriptionEntitlementReason =
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'expired'
  | 'canceled'
  | 'inactive'
  | 'grace_period_over'
  | 'period_ended';

export type SubscriptionEntitlement = {
  entitled: boolean;
  reason: SubscriptionEntitlementReason;
};

/**
 * THE single source of truth for whether a subscription still grants paid
 * features (remediation §4.7): a past_due subscription KEEPS access during
 * its grace window so the first failed charge doesn't instantly cut off a
 * paying user. All API/page/quota checks must go through this function —
 * the frontend receives the resulting entitlement state, it never infers it.
 */
export function isSubscriptionEntitled(
  subscription: {
    status: string | null | undefined;
    currentPeriodEnd: Date | null;
    gracePeriodEnd: Date | null;
  },
  now: Date,
): SubscriptionEntitlement {
  switch (subscription.status) {
    case 'active':
    case 'trialing': {
      if (subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now) {
        return { entitled: false, reason: 'period_ended' };
      }
      return { entitled: true, reason: subscription.status };
    }
    case 'past_due': {
      if (subscription.gracePeriodEnd && subscription.gracePeriodEnd > now) {
        return { entitled: true, reason: 'past_due_grace' };
      }
      return { entitled: false, reason: 'grace_period_over' };
    }
    case 'expired':
      return { entitled: false, reason: 'expired' };
    case 'canceled':
      return { entitled: false, reason: 'canceled' };
    default:
      return { entitled: false, reason: 'inactive' };
  }
}

export async function getWorkspaceBillingAccess(
  _userId: string,
  workspaceId: string,
): Promise<WorkspaceBillingAccess> {
  if (process.env.BILLING_DISABLED === 'true') {
    const definition = getTierDefinition('max');
    return { tier: 'max', modules: definition.modules, limits: definition.limits, capabilities: definition.capabilities };
  }

  const now = new Date();
  // past_due rows are fetched too and filtered through isSubscriptionEntitled:
  // the grace window keeps the workspace entitled (remediation §4.7).
  const rows = await prisma.subscription.findMany({
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

  const subscriptions = rows.filter((row) => isSubscriptionEntitled(row, now).entitled);
  return resolveBillingAccess(subscriptions);
}

export async function hasProjectCapacity(userId: string, workspaceId: string): Promise<boolean> {
  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  const count = await prisma.project.count({ where: { workspaceId } });
  return count < access.limits.projects;
}

export async function hasMemberCapacity(userId: string, workspaceId: string): Promise<boolean> {
  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  const count = await prisma.workspaceMember.count({ where: { workspaceId } });
  return count < access.limits.members;
}

export async function hasBrandCapacity(
  userId: string,
  workspaceId: string,
  isCompetitor: boolean,
): Promise<boolean> {
  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  const limit = isCompetitor ? access.limits.competitors : access.limits.brands;
  const count = await prisma.brand.count({
    where: { workspaceId, isCompetitor, deletedAt: null },
  });
  return count < limit;
}
