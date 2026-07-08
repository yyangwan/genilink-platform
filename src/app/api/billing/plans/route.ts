import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { listBillingOverview } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';

// GET /api/billing/plans — list purchasable plans and current subscriptions
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({
      plans: [],
      subscriptions: [],
      billingDisabled: process.env.BILLING_DISABLED === 'true',
    });
  }

  const overview = await listBillingOverview(session.user.id, workspaceId);

  return NextResponse.json({
    workspaceId,
    billingDisabled: process.env.BILLING_DISABLED === 'true',
    providerAvailability: overview.providerAvailability,
    plans: overview.plans.map((plan) => ({
      ...plan,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    })),
    subscriptions: overview.subscriptions.map((subscription) => ({
      ...subscription,
      createdAt: subscription.createdAt.toISOString(),
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      trialEnd: subscription.trialEnd?.toISOString() ?? null,
      updatedAt: subscription.updatedAt.toISOString(),
    })),
  });
}
