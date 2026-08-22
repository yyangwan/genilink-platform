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

export async function getWorkspaceBillingAccess(
  _userId: string,
  workspaceId: string,
): Promise<WorkspaceBillingAccess> {
  if (process.env.BILLING_DISABLED === 'true') {
    const definition = getTierDefinition('max');
    return { tier: 'max', modules: definition.modules, limits: definition.limits, capabilities: definition.capabilities };
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      workspaceId,
      status: { in: ['active', 'trialing'] },
      currentPeriodEnd: { gt: new Date() },
    },
    select: {
      module: true,
      billingPlan: { select: { key: true } },
    },
  });

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
