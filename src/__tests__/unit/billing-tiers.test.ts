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

  it('keeps lite on basic tools with lower usage quotas', () => {
    const lite = getTierDefinition('lite');
    const pro = getTierDefinition('pro');

    expect(lite.modules).toEqual(['visibility', 'content']);
    expect(lite.limits.promptsPerProject).toBe(10);
    expect(lite.limits.projects).toBeLessThan(pro.limits.projects);
    expect(lite.limits.contentGenerationsPerMonth).toBeLessThan(pro.limits.contentGenerationsPerMonth);
    expect(lite.limits.compareRunsPerMonth).toBe(0);
  });

  it('keeps API access out of current suite entitlements', () => {
    const access = resolveBillingAccess([
      { module: 'suite', billingPlan: { key: 'suite-max-monthly' } },
    ]);

    expect(access.tier).toBe('max');
    expect(access.modules).toEqual(['visibility', 'content']);
    expect(getTierDefinition('max').features.join(' ')).not.toContain('API');
  });

  it('does not grant access to retired module-only plans', () => {
    expect(resolveBillingAccess([{ module: 'content', billingPlan: null }])).toMatchObject({
      tier: null,
      modules: [],
    });
    expect(getTierFromPlanKey('visibility-monthly')).toBeNull();
  });
});
