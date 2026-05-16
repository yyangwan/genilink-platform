export type ModuleType = 'visibility' | 'content' | 'api_access';
export type SubscriptionStatus = 'active' | 'inactive' | 'trialing' | 'past_due';
export type BillingCycle = 'monthly' | 'yearly';

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
}
