import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { BILLING_PLAN_SEEDS } from '@/lib/billing/catalog';
import { isPaymentProviderConfigured } from '@/lib/billing/gateways';
import { syncBillingPlans } from '@/lib/billing/service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/billing/plans - list purchasable plans and current subscriptions
export async function GET() {
  const providerAvailability = {
    wechatpay: isPaymentProviderConfigured('wechatpay'),
    alipay: isPaymentProviderConfigured('alipay'),
  };

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({
      workspaceId: null,
      billingDisabled: process.env.BILLING_DISABLED === 'true',
      providerAvailability,
      plans: BILLING_PLAN_SEEDS.map((seed) => ({
        id: seed.key,
        key: seed.key,
        module: seed.module,
        billingCycle: seed.billingCycle,
        name: seed.name,
        description: seed.description,
        priceCents: seed.priceCents,
        currency: seed.currency,
        provider: seed.provider,
        checkoutUrl: seed.checkoutUrl ?? null,
        isActive: seed.isActive,
        sortOrder: seed.sortOrder,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      subscriptions: [],
    });
  }

  await syncBillingPlans();

  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const serializePlans = plans.map((plan) => ({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }));

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({
      workspaceId: null,
      billingDisabled: process.env.BILLING_DISABLED === 'true',
      providerAvailability,
      plans: serializePlans,
      subscriptions: [],
    });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: session.user.id,
      workspaceId,
    },
    select: {
      id: true,
      module: true,
      status: true,
      billingCycle: true,
      createdAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      trialEnd: true,
      provider: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      billingPlanId: true,
      paymentOrderId: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    workspaceId,
    billingDisabled: process.env.BILLING_DISABLED === 'true',
    providerAvailability,
    plans: serializePlans,
    subscriptions: subscriptions.map((subscription) => ({
      ...subscription,
      createdAt: subscription.createdAt.toISOString(),
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      trialEnd: subscription.trialEnd?.toISOString() ?? null,
      updatedAt: subscription.updatedAt.toISOString(),
    })),
  });
}
