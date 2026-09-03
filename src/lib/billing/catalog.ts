import type { BillingCycle, BillingProductType, SubscriptionTier } from '@/types/billing';
import { getTierDefinition, getTierFromPlanKey } from '@/lib/billing/tiers';

export type PaymentProvider = 'wechatpay' | 'alipay';

export interface BillingPlanSeed {
  key: string;
  module: BillingProductType;
  tier?: SubscriptionTier | null;
  billingCycle: BillingCycle;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  provider: PaymentProvider;
  checkoutUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface BillingPlanRecord extends BillingPlanSeed {
  id: string;
  providerPriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

const envString = (key: string): string | null => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

const defaultCurrency = envString('BILLING_CURRENCY') ?? 'CNY';

const tierPlan = (
  tier: SubscriptionTier,
  billingCycle: BillingCycle,
  priceCents: number,
  sortOrder: number,
): BillingPlanSeed => {
  const definition = getTierDefinition(tier);
  return {
    key: `suite-${tier}-${billingCycle}`,
    module: 'suite',
    tier,
    billingCycle,
    name: `${definition.name}${billingCycle === 'monthly' ? '月付' : '年付'}`,
    description: definition.description,
    priceCents,
    currency: defaultCurrency,
    provider: 'wechatpay',
    sortOrder,
    isActive: true,
  };
};

export const BILLING_PLAN_SEEDS: BillingPlanSeed[] = [
  tierPlan('lite', 'monthly', getTierDefinition('lite').monthlyPriceCents, 10),
  tierPlan('lite', 'yearly', getTierDefinition('lite').yearlyPriceCents, 20),
  tierPlan('pro', 'monthly', getTierDefinition('pro').monthlyPriceCents, 30),
  tierPlan('pro', 'yearly', getTierDefinition('pro').yearlyPriceCents, 40),
  tierPlan('max', 'monthly', getTierDefinition('max').monthlyPriceCents, 50),
  tierPlan('max', 'yearly', getTierDefinition('max').yearlyPriceCents, 60),
];

export function isBillingPlanConfigured(plan: BillingPlanSeed): boolean {
  return plan.priceCents > 0;
}

export function planLabel(plan: Pick<BillingPlanSeed, 'module' | 'billingCycle'>): string {
  return `${plan.module}-${plan.billingCycle}`;
}

export function getBillingPlanSeed(key: string): BillingPlanSeed | undefined {
  return BILLING_PLAN_SEEDS.find((plan) => plan.key === key);
}

export function getPlanTier(plan: Pick<BillingPlanSeed, 'key' | 'tier'>): SubscriptionTier | null {
  return plan.tier ?? getTierFromPlanKey(plan.key);
}
