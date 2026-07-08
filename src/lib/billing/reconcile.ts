import { prisma } from '@/lib/db';
import type { BillingProvider } from '@/types/billing';

function addPeriodEnd(start: Date, billingCycle: string): Date {
  const result = new Date(start);
  if (billingCycle === 'yearly') {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

export async function activateSubscriptionFromPayment(params: {
  orderId: string;
  provider: BillingProvider;
  providerSessionId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerStatus?: string | null;
  paidAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  trialEnd?: Date | null;
}) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    include: { billingPlan: true },
  });

  if (!order) {
    return null;
  }

  const currentPeriodStart = params.periodStart ?? order.createdAt;
  const currentPeriodEnd = params.periodEnd ?? addPeriodEnd(currentPeriodStart, order.billingCycle);
  const status = params.providerStatus && params.providerStatus !== 'SUCCESS' && params.providerStatus !== 'TRADE_SUCCESS' && params.providerStatus !== 'TRADE_FINISHED'
    ? params.providerStatus
    : 'active';

  const updatedSubscription = await prisma.subscription.upsert({
    where: {
      userId_workspaceId_module: {
        userId: order.userId,
        workspaceId: order.workspaceId,
        module: order.module,
      },
    },
    create: {
      userId: order.userId,
      workspaceId: order.workspaceId,
      module: order.module,
      status,
      billingCycle: order.billingCycle,
      billingPlanId: order.billingPlanId,
      provider: params.provider,
      providerCustomerId: params.providerCustomerId ?? null,
      providerSubscriptionId: params.providerSubscriptionId ?? params.providerSessionId ?? null,
      paymentOrderId: order.id,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd: params.trialEnd ?? null,
    },
    update: {
      status,
      billingCycle: order.billingCycle,
      billingPlanId: order.billingPlanId,
      provider: params.provider,
      providerCustomerId: params.providerCustomerId ?? null,
      providerSubscriptionId: params.providerSubscriptionId ?? params.providerSessionId ?? null,
      paymentOrderId: order.id,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd: params.trialEnd ?? null,
    },
  });

  const updatedOrder = await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      providerSessionId: params.providerSessionId ?? order.providerSessionId,
      providerCustomerId: params.providerCustomerId ?? order.providerCustomerId,
      providerSubscriptionId: params.providerSubscriptionId ?? order.providerSubscriptionId ?? params.providerSessionId ?? null,
      status: 'paid',
      paidAt: params.paidAt ?? order.paidAt ?? new Date(),
    },
  });

  return { order: updatedOrder, subscription: updatedSubscription };
}

