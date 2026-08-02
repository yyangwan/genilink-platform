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
}

const FREE_LIMITS = {
  projects: 1,
  members: 1,
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
  };
}

export async function getWorkspaceBillingAccess(
  _userId: string,
  workspaceId: string,
): Promise<WorkspaceBillingAccess> {
  if (process.env.BILLING_DISABLED === 'true') {
    const definition = getTierDefinition('max');
    return { tier: 'max', modules: definition.modules, limits: definition.limits };
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
