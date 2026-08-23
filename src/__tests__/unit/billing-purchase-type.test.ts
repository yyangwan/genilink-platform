import { describe, expect, it } from 'vitest';
import { resolvePurchaseType } from '@/lib/billing/checkout/purchase-type';

const now = new Date('2026-08-22T10:00:00.000Z');

function subscription(overrides: Partial<{
  id: string;
  billingPlanKey: string;
  billingCycle: string;
  autoRenew: boolean;
  currentPeriodEnd: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'sub-1',
    billingPlanKey: overrides.billingPlanKey ?? 'suite-pro-monthly',
    billingCycle: overrides.billingCycle ?? 'monthly',
    status: 'active',
    autoRenew: overrides.autoRenew ?? false,
    currentPeriodEnd: overrides.currentPeriodEnd ?? new Date('2026-09-22T00:00:00.000Z'),
  };
}

describe('resolvePurchaseType (spec §7.7 table)', () => {
  it('no active subscription -> new for any valid plan', () => {
    const result = resolvePurchaseType({ currentSubscription: null, targetPlanKey: 'suite-pro-yearly', now });
    expect(result).toEqual({ purchaseType: 'new', sourceSubscriptionId: null });
  });

  it('expired subscription counts as no subscription -> new', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z') }),
      targetPlanKey: 'suite-pro-yearly',
      now,
    });
    expect(result).toEqual({ purchaseType: 'new', sourceSubscriptionId: null });
  });

  it('higher tier -> upgrade', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-lite-monthly' }),
      targetPlanKey: 'suite-pro-yearly',
      now,
    });
    expect(result).toEqual({ purchaseType: 'upgrade', sourceSubscriptionId: 'sub-1' });
  });

  it('same tier monthly -> yearly -> upgrade', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-pro-monthly', billingCycle: 'monthly' }),
      targetPlanKey: 'suite-pro-yearly',
      now,
    });
    expect(result).toEqual({ purchaseType: 'upgrade', sourceSubscriptionId: 'sub-1' });
  });

  it('same tier yearly -> monthly -> rejected downgrade', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-pro-yearly', billingCycle: 'yearly' }),
      targetPlanKey: 'suite-pro-monthly',
      now,
    });
    expect(result).toEqual({ error: 'PLAN_DOWNGRADE_NOT_SUPPORTED' });
  });

  it('lower tier -> rejected downgrade', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-max-yearly' }),
      targetPlanKey: 'suite-pro-yearly',
      now,
    });
    expect(result).toEqual({ error: 'PLAN_DOWNGRADE_NOT_SUPPORTED' });
  });

  it('identical plan with autoRenew off -> manual_renewal anchored at period end', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-pro-monthly', autoRenew: false }),
      targetPlanKey: 'suite-pro-monthly',
      now,
    });
    expect(result).toEqual({
      purchaseType: 'manual_renewal',
      sourceSubscriptionId: 'sub-1',
      currentPeriodEnd: new Date('2026-09-22T00:00:00.000Z'),
    });
  });

  it('identical plan with autoRenew on -> AUTO_RENEW_ALREADY_ENABLED (spec §7.7)', () => {
    const result = resolvePurchaseType({
      currentSubscription: subscription({ billingPlanKey: 'suite-pro-monthly', autoRenew: true }),
      targetPlanKey: 'suite-pro-monthly',
      now,
    });
    expect(result).toEqual({ error: 'AUTO_RENEW_ALREADY_ENABLED' });
  });
});
