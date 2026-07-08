import type { BillingCycle, ModuleType } from '@/types/billing';

export type PaymentProvider = 'wechatpay' | 'alipay';

export interface BillingPlanSeed {
  key: string;
  module: ModuleType;
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

const envInt = (key: string): number | null => {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const defaultCurrency = envString('BILLING_CURRENCY') ?? 'CNY';

const visibilityMonthly = envInt('BILLING_VISIBILITY_MONTHLY_CENTS') ?? 0;
const visibilityYearly = envInt('BILLING_VISIBILITY_YEARLY_CENTS') ?? 0;
const contentMonthly = envInt('BILLING_CONTENT_MONTHLY_CENTS') ?? 0;
const contentYearly = envInt('BILLING_CONTENT_YEARLY_CENTS') ?? 0;

export const BILLING_PLAN_SEEDS: BillingPlanSeed[] = [
  {
    key: 'visibility-monthly',
    module: 'visibility',
    billingCycle: 'monthly',
    name: '可见性月订阅',
    description: '解锁 AI 搜索可见性分析、审计和建议生成。',
    priceCents: visibilityMonthly,
    currency: defaultCurrency,
    provider: 'wechatpay',
    sortOrder: 10,
    isActive: true,
  },
  {
    key: 'visibility-yearly',
    module: 'visibility',
    billingCycle: 'yearly',
    name: '可见性年订阅',
    description: '按年订阅可见性模块，适合长期使用。',
    priceCents: visibilityYearly,
    currency: defaultCurrency,
    provider: 'wechatpay',
    sortOrder: 20,
    isActive: true,
  },
  {
    key: 'content-monthly',
    module: 'content',
    billingCycle: 'monthly',
    name: '创作月订阅',
    description: '解锁 AI 内容创作与分发能力。',
    priceCents: contentMonthly,
    currency: defaultCurrency,
    provider: 'alipay',
    sortOrder: 30,
    isActive: true,
  },
  {
    key: 'content-yearly',
    module: 'content',
    billingCycle: 'yearly',
    name: '创作年订阅',
    description: '按年订阅创作模块，适合团队持续使用。',
    priceCents: contentYearly,
    currency: defaultCurrency,
    provider: 'alipay',
    sortOrder: 40,
    isActive: true,
  },
];

export function isBillingPlanConfigured(plan: BillingPlanSeed): boolean {
  return plan.priceCents > 0;
}

export function planLabel(plan: Pick<BillingPlanSeed, 'module' | 'billingCycle'>): string {
  return `${plan.module}-${plan.billingCycle}`;
}

export function getDefaultPlanKey(module: ModuleType, billingCycle: BillingCycle): string {
  return `${module}-${billingCycle}`;
}

export function getBillingPlanSeed(key: string): BillingPlanSeed | undefined {
  return BILLING_PLAN_SEEDS.find((plan) => plan.key === key);
}
