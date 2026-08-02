import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { getTierFromPlanKey } from '@/lib/billing/tiers';

// GET /api/billing/subscriptions — list subscriptions for the current workspace
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);

  if (!workspaceId) {
    return NextResponse.json({ subscriptions: [] });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
      module: true,
      status: true,
      billingCycle: true,
      provider: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      billingPlanId: true,
      billingPlan: { select: { key: true } },
      paymentOrderId: true,
      createdAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      trialEnd: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    subscriptions: subscriptions.map((subscription) => ({
      ...subscription,
      tier: getTierFromPlanKey(subscription.billingPlan?.key),
    })),
  });
}
