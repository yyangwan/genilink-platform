'use client';

import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import type { BillingCycle, SubscriptionTier } from '@/types/billing';
import { SUBSCRIPTION_TIERS, getTierDefinition } from '@/lib/billing/tiers';
import { formatSubscriptionPrice, type SubscriptionPlanView } from './subscription-plan-content';
import styles from './subscription-plans.module.css';

export type { SubscriptionPlanView } from './subscription-plan-content';

type Props = {
  plans: SubscriptionPlanView[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  billingDisabled?: boolean;
  getPlanHref?: (planKey: string, tier: SubscriptionTier) => string;
};

type MatrixRow = {
  label: string;
  values: Record<SubscriptionTier, string>;
};

type MatrixGroup = {
  title: string;
  rows: MatrixRow[];
};

const TIER_HIGHLIGHTS: Record<SubscriptionTier, string[]> = {
  lite: ['智见基础分析', '智创基础创作', '个人/小团队起步'],
  pro: ['完整增长闭环', '内容工作流', '推荐团队方案'],
  max: ['多项目管理', '规模化生产', '高级分析支持'],
};

const PLAN_MATRIX: MatrixGroup[] = [
  {
    title: '团队与项目容量',
    rows: [
      { label: '项目数量', values: { lite: '1 个', pro: '5 个', max: '20 个' } },
      { label: '团队成员', values: { lite: '1 人', pro: '5 人', max: '20 人' } },
      { label: '品牌资产', values: { lite: '1 个', pro: '5 个', max: '20 个' } },
      { label: '竞品品牌', values: { lite: '2 个', pro: '10 个', max: '50 个' } },
      { label: '提示词数量', values: { lite: '每项目 10 条', pro: '每项目 10 条', max: '每项目 10 条' } },
    ],
  },
  {
    title: '智见：分析与审计',
    rows: [
      { label: '网站分析', values: { lite: '10 次/月', pro: '100 次/月', max: '500 次/月' } },
      { label: '可见性审计', values: { lite: '3 次/月', pro: '30 次/月', max: '200 次/月' } },
      { label: '定时审计任务', values: { lite: '不支持', pro: '10 个', max: '100 个' } },
      { label: '竞品/审计对比', values: { lite: '不支持', pro: '5 次/月', max: '50 次/月' } },
      { label: 'PDF 报告导出', values: { lite: '1 次/月', pro: '30 次/月', max: '200 次/月' } },
    ],
  },
  {
    title: '智创：内容生产',
    rows: [
      { label: '智创功能范围', values: { lite: '基础创作工具', pro: '完整内容工作流', max: '规模化内容生产' } },
      { label: '内容生成', values: { lite: '10 次/月', pro: '100 次/月', max: '500 次/月' } },
      { label: '内容优化', values: { lite: '10 次/月', pro: '200 次/月', max: '1000 次/月' } },
      { label: '内容评分', values: { lite: '30 次/月', pro: '300 次/月', max: '2000 次/月' } },
      { label: '内容日历排期', values: { lite: '不支持', pro: '100 次/月', max: '500 次/月' } },
      { label: '品牌声音', values: { lite: '1 个', pro: '5 个', max: '20 个' } },
      { label: '内容模板', values: { lite: '5 个', pro: '20 个', max: '100 个' } },
    ],
  },
  {
    title: '服务与扩展',
    rows: [
      { label: '标准优化建议', values: { lite: '支持', pro: '支持', max: '支持' } },
      { label: '优先支持', values: { lite: '标准支持', pro: '优先支持', max: '高级支持' } },
      { label: '开放接口与系统集成', values: { lite: '不支持', pro: '不支持', max: '暂未开放' } },
    ],
  },
];

export function LandingSubscriptionPlans({
  plans,
  billingCycle,
  onBillingCycleChange,
  billingDisabled = false,
  getPlanHref,
}: Props) {
  const plansByTier = new Map(
    plans
      .filter((plan) => plan.billingCycle === billingCycle && plan.tier)
      .map((plan) => [plan.tier, plan]),
  );

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>统一订阅方案</span>
          <h2>一个版本，同时决定可用模块与使用额度</h2>
          <p>从轻量版开始，按团队成长升级到专业版或高级版；升级只会解锁更多能力，不会减少已有权益。</p>
        </div>
        <div className={styles.trust} aria-label="订阅说明">
          <span>智见 + 智创统一管理</span>
          <span>仅支持向上升级</span>
        </div>
      </div>

      <div className={styles.cycleSwitch} role="group" aria-label="订阅周期">
        {(['monthly', 'yearly'] as const).map((cycle) => (
          <button
            key={cycle}
            type="button"
            aria-pressed={billingCycle === cycle}
            className={billingCycle === cycle ? styles.cycleActive : styles.cycleButton}
            onClick={() => onBillingCycleChange(cycle)}
          >
            {cycle === 'monthly' ? '月付' : '年付'}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {SUBSCRIPTION_TIERS.map((tier) => {
          const plan = plansByTier.get(tier.key);
          const disabled = billingDisabled || !plan?.configured;
          const ctaLabel = disabled ? '待配置' : `选择${tier.name}`;

          const actionContent = (
            <>
              {disabled ? <ShieldCheck size={16} /> : null}
              {ctaLabel}
              {!disabled ? <ArrowRight size={16} /> : null}
            </>
          );

          return (
            <article key={tier.key} className={tier.recommended ? styles.cardFeatured : styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <span className={styles.eyebrow}>{tier.eyebrow}</span>
                  <h3>{tier.name}</h3>
                </div>
                <span className={styles.badge}>{tier.badge}</span>
              </div>
              <p className={styles.description}>{tier.description}</p>

              <div className={styles.highlightStrip}>
                {TIER_HIGHLIGHTS[tier.key].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className={styles.priceRow}>
                <strong>{plan ? formatSubscriptionPrice(plan.priceCents, plan.currency) : '待配置'}</strong>
                <span>{plan?.priceCents ? (billingCycle === 'monthly' ? '/月' : '/年') : ''}</span>
              </div>

              <div className={styles.modules}>
                {getTierDefinition(tier.key).modules.map((module) => (
                  <span key={module}>
                    {module === 'visibility' ? '智见' : module === 'content' ? '智创' : 'API'}
                  </span>
                ))}
              </div>

              <ul className={styles.features}>
                {tier.features.map((feature) => (
                  <li key={feature}><Check size={16} /><span>{feature}</span></li>
                ))}
              </ul>

              {plan && getPlanHref && !disabled ? (
                <Link className={tier.recommended ? styles.ctaPrimary : styles.cta} href={getPlanHref(plan.key, tier.key)}>
                  {actionContent}
                </Link>
              ) : (
                <button
                  type="button"
                  className={tier.recommended ? styles.ctaPrimary : styles.cta}
                  disabled
                >
                  {actionContent}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className={styles.matrix} aria-label="套餐功能范围对比">
        <div className={styles.matrixHeader}>
          <span>功能范围</span>
          {SUBSCRIPTION_TIERS.map((tier) => (
            <strong key={tier.key}>{tier.name}</strong>
          ))}
        </div>

        {PLAN_MATRIX.map((group) => (
          <div key={group.title} className={styles.matrixGroup}>
            <h3>{group.title}</h3>
            {group.rows.map((row) => (
              <div key={row.label} className={styles.matrixRow}>
                <span>{row.label}</span>
                {SUBSCRIPTION_TIERS.map((tier) => (
                  <strong key={tier.key}>{row.values[tier.key]}</strong>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
