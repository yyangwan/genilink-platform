import type { BillingCycle, BillingProvider, SubscriptionTier } from '@/types/billing';

export type SubscriptionPlanView = {
  id: string;
  key: string;
  tier?: SubscriptionTier | null;
  billingCycle: BillingCycle;
  priceCents: number;
  currency: string;
  provider: BillingProvider;
  configured?: boolean;
};

export const PAYMENT_PROVIDER_LABELS: Record<BillingProvider, string> = {
  wechatpay: '微信支付',
  alipay: '支付宝',
};

export function formatSubscriptionPrice(priceCents: number, currency: string) {
  if (priceCents <= 0) return '待配置';
  const value = priceCents / 100;
  return currency.toUpperCase() === 'CNY'
    ? `¥${value.toFixed(2)}`
    : `${currency.toUpperCase()} ${value.toFixed(2)}`;
}
