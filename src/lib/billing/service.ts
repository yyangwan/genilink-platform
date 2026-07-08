import { prisma } from '@/lib/db';
import { BILLING_PLAN_SEEDS } from '@/lib/billing/catalog';
import { isPaymentProviderConfigured, type PaymentProvider } from '@/lib/billing/gateways';

export async function syncBillingPlans() {
  try {
    await Promise.all(
      BILLING_PLAN_SEEDS.map((seed) =>
        prisma.billingPlan.upsert({
          where: { key: seed.key },
          create: {
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
          },
          update: {
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
          },
        }),
      ),
    );
  } catch (error) {
    console.warn('Billing plan sync skipped', error);
  }
}

export async function listBillingOverview(userId: string, workspaceId: string) {
  await syncBillingPlans();

  const [plans, subscriptions] = await Promise.all([
    prisma.billingPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.subscription.findMany({
      where: {
        userId,
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
    }),
  ]);

  return {
    plans: plans.map((plan) => ({
      ...plan,
      configured: plan.priceCents > 0 && isPaymentProviderConfigured(plan.provider as PaymentProvider),
    })),
    subscriptions,
    providerAvailability: {
      wechatpay: isPaymentProviderConfigured('wechatpay'),
      alipay: isPaymentProviderConfigured('alipay'),
    },
  };
}

export async function getBillingPlanByKey(key: string) {
  await syncBillingPlans();
  return prisma.billingPlan.findUnique({
    where: { key },
  });
}
