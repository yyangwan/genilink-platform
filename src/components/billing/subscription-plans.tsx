'use client';

import Link from 'next/link';
import { ArrowRight, Check, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import type { BillingCycle, BillingProvider, SubscriptionTier } from '@/types/billing';
import { SUBSCRIPTION_TIERS, getTierDefinition, isUpgrade } from '@/lib/billing/tiers';
import styles from './subscription-plans.module.css';

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

type Props = {
  plans: SubscriptionPlanView[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  currentTier?: SubscriptionTier | null;
  billingDisabled?: boolean;
  pendingPlanKey?: string | null;
  providerAvailability?: Partial<Record<BillingProvider, boolean>>;
  selectedProviders?: Record<string, BillingProvider>;
  onProviderChange?: (planKey: string, provider: BillingProvider) => void;
  onCheckout?: (planKey: string) => void;
  getPlanHref?: (planKey: string, tier: SubscriptionTier) => string;
};

const PROVIDER_LABELS: Record<BillingProvider, string> = {
  wechatpay: '微信支付',
  alipay: '支付宝',
};

function formatPrice(priceCents: number, currency: string) {
  if (priceCents <= 0) return '待配置';
  const value = priceCents / 100;
  return currency.toUpperCase() === 'CNY'
    ? `¥${value.toFixed(2)}`
    : `${currency.toUpperCase()} ${value.toFixed(2)}`;
}

export function SubscriptionPlans({
  plans,
  billingCycle,
  onBillingCycleChange,
  currentTier = null,
  billingDisabled = false,
  pendingPlanKey = null,
  providerAvailability,
  selectedProviders,
  onProviderChange,
  onCheckout,
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
          const isCurrent = currentTier === tier.key;
          const canUpgrade = isUpgrade(currentTier, tier.key);
          const isIncluded = Boolean(currentTier && !isCurrent && !canUpgrade);
          const disabled = billingDisabled || !plan?.configured || isCurrent || isIncluded;
          const providerOptions = (['wechatpay', 'alipay'] as const).filter(
            (provider) => providerAvailability?.[provider],
          );
          const ctaLabel = pendingPlanKey === plan?.key
            ? '正在创建订单'
            : isCurrent
              ? '当前版本'
              : isIncluded
                ? '已包含'
                : billingDisabled || !plan?.configured
                  ? '待配置'
                  : currentTier
                    ? `升级到${tier.name}`
                    : `开通${tier.name}`;

          const actionContent = (
            <>
              {pendingPlanKey === plan?.key ? <Loader2 className={styles.spinner} size={16} /> : null}
              {isCurrent ? <CheckCircle2 size={16} /> : null}
              {!plan?.configured && !isCurrent ? <ShieldCheck size={16} /> : null}
              {ctaLabel}
              {!disabled && pendingPlanKey !== plan?.key ? <ArrowRight size={16} /> : null}
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
                <strong>{plan ? formatPrice(plan.priceCents, plan.currency) : '待配置'}</strong>
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

              {plan && onProviderChange && providerOptions.length > 0 ? (
                <div className={styles.providers} aria-label={`${tier.name}支付方式`}>
                  {providerOptions.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className={selectedProviders?.[plan.key] === provider ? styles.providerActive : styles.provider}
                      onClick={() => onProviderChange(plan.key, provider)}
                      disabled={isCurrent || isIncluded}
                    >
                      {PROVIDER_LABELS[provider]}
                    </button>
                  ))}
                </div>
              ) : null}

              {plan && getPlanHref && !disabled ? (
                <Link className={tier.recommended ? styles.ctaPrimary : styles.cta} href={getPlanHref(plan.key, tier.key)}>
                  {actionContent}
                </Link>
              ) : (
                <button
                  type="button"
                  className={tier.recommended ? styles.ctaPrimary : styles.cta}
                  disabled={disabled || pendingPlanKey === plan?.key}
                  onClick={() => plan && onCheckout?.(plan.key)}
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
