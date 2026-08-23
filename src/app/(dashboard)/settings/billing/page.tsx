'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { AccountSubscriptionPlans } from '@/components/billing/account-subscription-plans';
import type { SubscriptionPlanView } from '@/components/billing/subscription-plan-content';
import { formatDateInTimeZone } from '@/lib/time';
import { getTierDefinition, highestTier } from '@/lib/billing/tiers';
import { formatCents } from '@/lib/billing/format';
import type { BillingCycle, SubscriptionTier } from '@/types/billing';

type Subscription = {
  id: string;
  module: string;
  tier?: SubscriptionTier | null;
  status: string;
  billingCycle: BillingCycle;
  currentPeriodEnd: string;
  provider: string | null;
  autoRenew?: boolean;
  cancelAtPeriodEnd?: boolean;
  nextBillingAt?: string | null;
  gracePeriodEnd?: string | null;
  renewalPriceCents?: number | null;
};

type BillingOverview = {
  workspaceId: string | null;
  plans: SubscriptionPlanView[];
  subscriptions: Subscription[];
  billingDisabled: boolean;
};

const MODULE_LABELS: Record<string, string> = {
  suite: '统一订阅',
  visibility: '智见',
  content: '智创',
  api_access: 'API',
};

const ERROR_MESSAGES: Record<string, string> = {
  PLAN_DOWNGRADE_NOT_SUPPORTED: '暂不支持降级套餐。年付切换到月付请于到期后操作。',
  AUTO_RENEW_ALREADY_ENABLED: '该订阅已开启自动续期，无需手动续费；可在下方订阅管理中关闭。',
  ACTIVE_SUBSCRIPTION_EXISTS: '已有有效订阅。',
  PAYMENT_PROVIDER_NOT_CONFIGURED: '支付渠道尚未配置，请联系管理员。',
  QUOTE_MISMATCH: '价格已更新，请刷新后重试。',
};

export default function BillingSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPendingKey, setCheckoutPendingKey] = useState<string | null>(null);
  const [revokingSubscriptionId, setRevokingSubscriptionId] = useState<string | null>(null);
  const [renewalNotice, setRenewalNotice] = useState<string | null>(null);
  const accessSyncAttemptedRef = useRef(false);

  const loadOverview = useCallback(() => {
    const controller = new AbortController();
    fetch('/api/billing/plans', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<BillingOverview>;
      })
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== 'AbortError') setError('订阅数据加载失败');
      })
      .finally(() => setLoading(false));
    return controller;
  }, []);

  useEffect(() => {
    const controller = loadOverview();
    return () => controller.abort();
  }, [loadOverview]);

  const activeSubscriptions = useMemo(
    () => (overview?.subscriptions ?? []).filter((subscription) =>
      subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'past_due'),
    [overview],
  );
  const currentTier = useMemo(() => highestTier([
    ...activeSubscriptions.map((subscription) => subscription.tier),
  ]), [activeSubscriptions]);
  const currentBillingCycle = useMemo(
    () => activeSubscriptions.find((subscription) => subscription.tier === currentTier)?.billingCycle ?? null,
    [activeSubscriptions, currentTier],
  );

  const checkoutState = searchParams.get('checkout');

  useEffect(() => {
    if (checkoutState !== 'success' || !overview?.workspaceId || accessSyncAttemptedRef.current) return;
    accessSyncAttemptedRef.current = true;
    fetch('/api/billing/access', { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        loadOverview();
        router.replace('/settings/billing');
      })
      .catch(() => { accessSyncAttemptedRef.current = false; });
  }, [checkoutState, overview?.workspaceId, loadOverview, router]);

  // Unified checkout entry (spec §10.1): create a session, then jump to the
  // standalone cashier. Channel selection happens on the cashier page.
  const handleCheckout = async (planKey: string) => {
    setCheckoutPendingKey(planKey);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ planKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.checkoutSession?.id) {
        const code = data?.error?.code as string | undefined;
        if (code && ERROR_MESSAGES[code]) {
          setError(ERROR_MESSAGES[code]);
          return;
        }
        throw new Error(data?.error?.message ?? 'checkout failed');
      }
      router.push(`/checkout/${data.checkoutSession.id}`);
    } catch {
      setError('创建结算会话失败，请重试。');
    } finally {
      setCheckoutPendingKey(null);
    }
  };

  const handleDisableAutoRenew = async (subscriptionId: string) => {
    setRevokingSubscriptionId(subscriptionId);
    setRenewalNotice(null);
    try {
      const response = await fetch(`/api/billing/subscriptions/${subscriptionId}/auto-renew`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202) {
        setRenewalNotice('正在关闭自动续期，关闭完成后将不再扣款。');
      } else if (response.ok) {
        setRenewalNotice('已关闭自动续期，当前周期继续有效。');
      } else {
        setRenewalNotice(data?.error?.message ?? '关闭自动续期失败，请稍后重试。');
      }
      loadOverview();
    } catch {
      setRenewalNotice('关闭自动续期失败，请稍后重试。');
    } finally {
      setRevokingSubscriptionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>订阅与升级</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>查看当前套餐、订阅状态和可升级版本。</p>
        </div>
        <div className="dashboard-surface inline-flex items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <ShieldCheck className="h-4 w-4" />
          {overview?.billingDisabled ? '当前处于订阅关闭模式' : currentTier ? `当前：${getTierDefinition(currentTier).name}` : '尚未开通统一订阅'}
        </div>
      </div>

      {checkoutState === 'canceled' ? (
        <div className="dashboard-surface flex items-center gap-2 px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="h-4 w-4" />收款流程已取消。
        </div>
      ) : null}
      {error ? <div className="dashboard-surface px-4 py-3 text-sm" style={{ color: 'var(--color-error)' }}>{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="dashboard-skeleton h-[520px] rounded-xl animate-skeleton-pulse" />)}
        </div>
      ) : (
        <AccountSubscriptionPlans
          plans={overview?.plans ?? []}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
          currentTier={currentTier}
          currentBillingCycle={currentBillingCycle}
          billingDisabled={overview?.billingDisabled}
          pendingPlanKey={checkoutPendingKey}
          onCheckout={handleCheckout}
        />
      )}

      {!loading && activeSubscriptions.length > 0 ? (
        <section className="dashboard-surface dashboard-surface--padded">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>订阅管理</h2>
          {renewalNotice ? (
            <div className="mt-3 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {renewalNotice}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3">
            {activeSubscriptions.map((subscription) => (
              <div key={subscription.id} className="dashboard-surface flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {subscription.tier ? getTierDefinition(subscription.tier).name : MODULE_LABELS[subscription.module] ?? subscription.module}
                  {' · '}{subscription.billingCycle === 'monthly' ? '月付' : '年付'}
                  {subscription.status === 'past_due' ? (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 12%, transparent)' }}>
                      宽限期
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    有效至 {formatDateInTimeZone(subscription.currentPeriodEnd, { includeTime: false, includeYear: true })}
                  </span>
                  <span>
                    {subscription.autoRenew
                      ? subscription.nextBillingAt
                        ? `下次自动扣款 ${formatDateInTimeZone(subscription.nextBillingAt, { includeTime: false, includeYear: true })}${
                            subscription.renewalPriceCents ? `（${formatCents(subscription.renewalPriceCents)}）` : ''
                          }`
                        : '已开启自动续期'
                      : subscription.cancelAtPeriodEnd
                        ? '自动续期关闭中，到期后不再扣款'
                        : '未开启自动续期'}
                  </span>
                  {subscription.autoRenew ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      disabled={revokingSubscriptionId === subscription.id}
                      onClick={() => void handleDisableAutoRenew(subscription.id)}
                    >
                      {revokingSubscriptionId === subscription.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      关闭自动续期
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            关闭自动续期后当前周期继续有效，到期后不再扣款；可随时重新订阅或手动续费。
          </p>
        </section>
      ) : null}
    </div>
  );
}
