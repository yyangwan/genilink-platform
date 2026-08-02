import { describe, expect, it } from 'vitest';
import {
  getTierDefinition,
  getTierFromPlanKey,
  isUpgrade,
} from '@/lib/billing/tiers';
import { resolveBillingAccess } from '@/lib/billing/access';
import { BILLING_PLAN_SEEDS } from '@/lib/billing/catalog';

describe('subscription tiers', () => {
  it('publishes only six suite plans', () => {
    expect(BILLING_PLAN_SEEDS).toHaveLength(6);
    expect(BILLING_PLAN_SEEDS.every((plan) => plan.module === 'suite')).toBe(true);
    expect(BILLING_PLAN_SEEDS.map((plan) => plan.key)).toEqual([
      'suite-lite-monthly',
      'suite-lite-yearly',
      'suite-pro-monthly',
      'suite-pro-yearly',
      'suite-max-monthly',
      'suite-max-yearly',
    ]);
  });

  it('orders upgrades from lite to pro to max', () => {
    expect(isUpgrade(null, 'lite')).toBe(true);
    expect(isUpgrade('lite', 'pro')).toBe(true);
    expect(isUpgrade('pro', 'max')).toBe(true);
    expect(isUpgrade('pro', 'lite')).toBe(false);
    expect(isUpgrade('max', 'max')).toBe(false);
  });

  it('expands a suite plan into module entitlements and limits', () => {
    const access = resolveBillingAccess([
      { module: 'suite', billingPlan: { key: 'suite-pro-monthly' } },
    ]);

    expect(access.tier).toBe('pro');
    expect(access.modules).toEqual(['visibility', 'content']);
    expect(access.limits).toEqual(getTierDefinition('pro').limits);
  });

  it('does not grant access to retired module-only plans', () => {
    expect(resolveBillingAccess([{ module: 'content', billingPlan: null }])).toMatchObject({
      tier: null,
      modules: [],
    });
    expect(getTierFromPlanKey('visibility-monthly')).toBeNull();
  });
});
