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
    </section>
  );
}
