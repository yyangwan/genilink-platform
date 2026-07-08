export type ModuleType = 'visibility' | 'content' | 'api_access';
export type SubscriptionStatus = 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled';
export type BillingCycle = 'monthly' | 'yearly';
export type BillingProvider = 'wechatpay' | 'alipay';
export type PaymentOrderStatus = 'pending' | 'opened' | 'paid' | 'expired' | 'failed' | 'canceled' | 'refunded';
export type PaymentEventStatus = 'received' | 'processed' | 'ignored' | 'failed';

export interface Subscription {
  id: string;
  userId: string;
  workspaceId: string;
  module: ModuleType;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd?: string;
  provider?: BillingProvider | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  billingPlanId?: string | null;
  paymentOrderId?: string | null;
}

export interface BillingPlan {
  id: string;
  key: string;
  module: ModuleType;
  billingCycle: BillingCycle;
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  provider: BillingProvider;
  checkoutUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
  configured?: boolean;
}

export interface PaymentOrder {
  id: string;
  userId: string;
  workspaceId: string;
  billingPlanId: string;
  module: ModuleType;
  billingCycle: BillingCycle;
  provider: BillingProvider;
  providerSessionId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  status: PaymentOrderStatus;
  amountCents: number;
  currency: string;
  checkoutUrl?: string | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
  paidAt?: string | null;
  expiredAt?: string | null;
}

export interface PaymentEvent {
  id: string;
  provider: BillingProvider;
  providerEventId: string;
  eventType: string;
  status: PaymentEventStatus;
  signatureVerified: boolean;
  paymentOrderId?: string | null;
  processedAt?: string | null;
}
