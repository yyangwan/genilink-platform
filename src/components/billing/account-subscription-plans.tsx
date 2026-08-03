'use client';

import { ArrowUpRight, Check, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { SUBSCRIPTION_TIERS, getTierDefinition, isUpgrade } from '@/lib/billing/tiers';
import type { BillingCycle, BillingProvider, SubscriptionTier } from '@/types/billing';
import {
  formatSubscriptionPrice,
  PAYMENT_PROVIDER_LABELS,
  type SubscriptionPlanView,
} from './subscription-plan-content';

type Props = {
  plans: SubscriptionPlanView[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  currentTier: SubscriptionTier | null;
  billingDisabled?: boolean;
  pendingPlanKey?: string | null;
  providerAvailability?: Partial<Record<BillingProvider, boolean>>;
  selectedProviders: Record<string, BillingProvider>;
  onProviderChange: (planKey: string, provider: BillingProvider) => void;
  onCheckout: (planKey: string) => void;
};

export function AccountSubscriptionPlans({
  plans,
  billingCycle,
  onBillingCycleChange,
  currentTier,
  billingDisabled = false,
  pendingPlanKey = null,
  providerAvailability,
  selectedProviders,
  onProviderChange,
  onCheckout,
}: Props) {
  const plansByTier = new Map(
    plans
      .filter((plan) => plan.billingCycle === billingCycle && plan.tier)
      .map((plan) => [plan.tier, plan]),
  );

  return (
    <section className="dashboard-surface dashboard-surface--padded">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>选择升级方案</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            套餐权益与官网一致，这里只展示当前账号可以执行的订阅操作。
          </p>
        </div>
        <div className="inline-flex rounded-full border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }} role="group" aria-label="订阅周期">
          {(['monthly', 'yearly'] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              aria-pressed={billingCycle === cycle}
              className="min-w-20 cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors"
              style={billingCycle === cycle
                ? { color: '#0b0d14', background: 'var(--color-primary)' }
                : { color: 'var(--text-secondary)' }}
              onClick={() => onBillingCycleChange(cycle)}
            >
              {cycle === 'monthly' ? '月付' : '年付'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {SUBSCRIPTION_TIERS.map((tier) => {
          const plan = plansByTier.get(tier.key);
          const isCurrent = currentTier === tier.key;
          const canUpgrade = isUpgrade(currentTier, tier.key);
          const isIncluded = Boolean(currentTier && !isCurrent && !canUpgrade);
          const isPending = pendingPlanKey === plan?.key;
          const disabled = billingDisabled || !plan?.configured || isCurrent || isIncluded || isPending;
          const providerOptions = (['wechatpay', 'alipay'] as const).filter(
            (provider) => providerAvailability?.[provider],
          );
          const actionLabel = isPending
            ? '正在创建订单'
            : isCurrent
              ? '当前版本'
              : isIncluded
                ? '已包含在当前版本'
                : billingDisabled || !plan?.configured
                  ? '待配置'
                  : currentTier
                    ? `升级到${tier.name}`
                    : `开通${tier.name}`;

          return (
            <article
              key={tier.key}
              className="flex flex-col rounded-xl border p-5"
              style={{
                borderColor: isCurrent ? 'var(--color-primary)' : 'var(--border)',
                background: isCurrent ? 'color-mix(in srgb, var(--color-primary) 7%, var(--bg-card))' : 'var(--bg-card)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-primary)' }}>{tier.eyebrow}</span>
                  <h3 className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{tier.name}</h3>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: isCurrent ? '#0b0d14' : 'var(--color-primary)', background: isCurrent ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}>
                  {isCurrent ? '当前套餐' : tier.badge}
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <strong className="text-2xl" style={{ color: 'var(--text-primary)' }}>
                  {plan ? formatSubscriptionPrice(plan.priceCents, plan.currency) : '待配置'}
                </strong>
                {plan?.priceCents ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/{billingCycle === 'monthly' ? '月' : '年'}</span> : null}
              </div>

              <p className="mt-3 min-h-11 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{tier.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {getTierDefinition(tier.key).modules.map((module) => (
                  <span key={module} className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    {module === 'visibility' ? '智见' : module === 'content' ? '智创' : 'API'}
                  </span>
                ))}
              </div>

              <ul className="mt-4 grid gap-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan && providerOptions.length > 0 && canUpgrade ? (
                <div className="mt-5 grid grid-cols-2 gap-2" aria-label={`${tier.name}支付方式`}>
                  {providerOptions.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="cursor-pointer rounded-lg border px-2 py-2 text-xs font-semibold"
                      style={selectedProviders[plan.key] === provider
                        ? { borderColor: 'var(--color-primary)', color: 'var(--text-primary)', background: 'color-mix(in srgb, var(--color-primary) 9%, transparent)' }
                        : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      onClick={() => onProviderChange(plan.key, provider)}
                    >
                      {PAYMENT_PROVIDER_LABELS[provider]}
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={tier.recommended && !disabled
                  ? { borderColor: 'var(--color-primary)', color: '#0b0d14', background: 'var(--color-primary)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                disabled={disabled}
                onClick={() => plan && onCheckout(plan.key)}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent ? <CheckCircle2 className="h-4 w-4" /> : null}
                {!plan?.configured && !isCurrent ? <ShieldCheck className="h-4 w-4" /> : null}
                {actionLabel}
                {!disabled ? <ArrowUpRight className="h-4 w-4" /> : null}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
