'use client';

import Link from 'next/link';
import { ArrowRight, BookOpenText, Check, ShieldCheck, X } from 'lucide-react';
import type { BillingCycle, SubscriptionTier } from '@/types/billing';
import { SUBSCRIPTION_PLAN_MATRIX, SUBSCRIPTION_TIERS, getTierDefinition } from '@/lib/billing/tiers';
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

function MatrixValue({ value, tierName }: { value: string; tierName: string }) {
  if (value === '不支持') {
    return (
      <strong className={styles.matrixUnsupported} data-tier={tierName} aria-label="不支持" title="不支持">
        <X size={18} strokeWidth={2.4} aria-hidden="true" />
      </strong>
    );
  }

  return <strong data-tier={tierName}>{value}</strong>;
}

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
                {tier.highlights.map((item) => (
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

              <ul className={styles.features} aria-label={`${tier.name}核心权益`}>
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

      <div className={styles.guideCallout}>
        <div>
          <span><BookOpenText size={16} />套餐权益说明</span>
          <p>不确定基础版、完整版和高级版有什么区别？查看额度计算、报告范围与功能边界。</p>
        </div>
        <Link href="/pricing-guide" className={styles.guideLink}>
          查看详细说明
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className={styles.matrix} aria-label="套餐功能范围对比">
        <div className={styles.matrixHeader}>
          <span>功能范围</span>
          {SUBSCRIPTION_TIERS.map((tier) => (
            <strong key={tier.key}>{tier.name}</strong>
          ))}
        </div>

        {SUBSCRIPTION_PLAN_MATRIX.map((group) => (
          <div key={group.title} className={styles.matrixGroup}>
            <h3>{group.title}</h3>
            {group.rows.map((row) => (
              <div key={row.label} className={styles.matrixRow}>
                <span>{row.label}</span>
                {SUBSCRIPTION_TIERS.map((tier) => (
                  <MatrixValue key={tier.key} value={row.values[tier.key]} tierName={tier.name} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
