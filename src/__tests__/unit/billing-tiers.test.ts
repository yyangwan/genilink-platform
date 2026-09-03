import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_PLAN_MATRIX,
  SUBSCRIPTION_TIERS,
  getTierDefinition,
  getTierFromPlanKey,
  hasCapabilityLevel,
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
    expect(BILLING_PLAN_SEEDS.every((plan) => plan.priceCents === 100)).toBe(true);
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
    expect(lite.limits.contentOptimizationsPerMonth).toBeGreaterThan(0);
    expect(lite.limits.seoOptimizationsPerMonth).toBe(10);
    expect(lite.limits.contentScoresPerMonth).toBeGreaterThan(0);
    expect(lite.limits.calendarItemsPerMonth).toBe(10);
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

  it('derives every numeric pricing row from the enforced tier limits', () => {
    const numericRows = SUBSCRIPTION_PLAN_MATRIX.flatMap((group) => group.rows).filter((row) => row.limitKey);

    expect(numericRows).toHaveLength(17);
    for (const row of numericRows) {
      for (const tier of SUBSCRIPTION_TIERS) {
        const limit = tier.limits[row.limitKey!];
        expect(row.values[tier.key]).toContain(limit === 0 ? '不支持' : String(limit));
      }
    }
  });

  it('publishes the complete canonical pricing matrix', () => {
    const rows = SUBSCRIPTION_PLAN_MATRIX.flatMap((group) => group.rows);
    const row = (label: string) => rows.find((item) => item.label === label)?.values;

    expect(rows).toHaveLength(33);
    expect(row('月付价格')).toEqual({ lite: '¥1/月', pro: '¥1/月', max: '¥1/月' });
    expect(row('年付价格')).toEqual({ lite: '¥1/年', pro: '¥1/年', max: '¥1/年' });
    expect(row('AI 可见性审计')).toEqual({ lite: '3 次/月', pro: '30 次/月', max: '200 次/月' });
    expect(row('审计报告')).toEqual({ lite: '基础报告', pro: '完整报告', max: '高级报告' });
    expect(row('趋势历史')).toEqual({ lite: '最近 30 天', pro: '最近 12 个月', max: '最近 24 个月' });
    expect(row('战略智能')).toEqual({ lite: '不支持', pro: '基础版', max: '完整版' });
    expect(row('内容创作')).toEqual({ lite: '10 篇/月', pro: '100 篇/月', max: '500 篇/月' });
    expect(row('SEO 优化')).toEqual({ lite: '10 次/月', pro: '200 次/月', max: '1000 次/月' });
    expect(row('内容日历')).toEqual({ lite: '基础版', pro: '完整版', max: '完整版' });
    expect(row('平台配置')).toEqual({ lite: '基础配置', pro: '完整配置', max: '完整配置' });
    expect(row('开放接口与系统集成')).toEqual({ lite: '不支持', pro: '不支持', max: '暂未开放' });
    expect(row('客户支持')).toEqual({ lite: '标准支持', pro: '标准支持', max: '优先支持' });
  });

  it('enforces capability levels by tier', () => {
    expect(hasCapabilityLevel(getTierDefinition('lite').capabilities.strategicIntelligence)).toBe(false);
    expect(hasCapabilityLevel(getTierDefinition('pro').capabilities.strategicIntelligence)).toBe(true);
    expect(hasCapabilityLevel(getTierDefinition('pro').capabilities.strategicIntelligence, 'full')).toBe(false);
    expect(hasCapabilityLevel(getTierDefinition('max').capabilities.strategicIntelligence, 'full')).toBe(true);
  });

  it('does not grant access to retired module-only plans', () => {
    expect(resolveBillingAccess([{ module: 'content', billingPlan: null }])).toMatchObject({
      tier: null,
      modules: [],
    });
    expect(getTierFromPlanKey('visibility-monthly')).toBeNull();
  });
});
