'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { AccountSubscriptionPlans } from '@/components/billing/account-subscription-plans';
import type { SubscriptionPlanView } from '@/components/billing/subscription-plan-content';
import { formatDateInTimeZone } from '@/lib/time';
import { getTierDefinition, highestTier } from '@/lib/billing/tiers';
import type { BillingCycle, BillingProvider, SubscriptionTier } from '@/types/billing';

type Subscription = {
  id: string;
  module: string;
  tier?: SubscriptionTier | null;
  status: string;
  billingCycle: BillingCycle;
  currentPeriodEnd: string;
  provider: string | null;
};

type BillingOverview = {
  workspaceId: string | null;
  plans: SubscriptionPlanView[];
  subscriptions: Subscription[];
  billingDisabled: boolean;
  providerAvailability?: Partial<Record<BillingProvider, boolean>>;
};

const MODULE_LABELS: Record<string, string> = {
  suite: '统一订阅',
  visibility: '智见',
  content: '智创',
  api_access: 'API',
};

export default function BillingSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPendingKey, setCheckoutPendingKey] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, BillingProvider>>({});
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
        setSelectedProviders((current) => {
          const next = { ...current };
          for (const plan of data.plans) {
            if (next[plan.key]) continue;
            next[plan.key] = data.providerAvailability?.[plan.provider]
              ? plan.provider
              : data.providerAvailability?.wechatpay
                ? 'wechatpay'
                : data.providerAvailability?.alipay
                  ? 'alipay'
                  : plan.provider;
          }
          return next;
        });
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
      subscription.status === 'active' || subscription.status === 'trialing'),
    [overview],
  );
  const currentTier = useMemo(() => highestTier([
    ...activeSubscriptions.map((subscription) => subscription.tier),
  ]), [activeSubscriptions]);

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

  const handleCheckout = async (planKey: string) => {
    setCheckoutPendingKey(planKey);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, provider: selectedProviders[planKey] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.code === 'PLAN_NOT_AN_UPGRADE') {
          setError('只能选择高于当前版本的订阅方案。');
          return;
        }
        if (response.status === 503) {
          setError('价格或收款配置尚未完成。');
          return;
        }
        throw new Error(data?.error ?? 'checkout failed');
      }
      if (!data?.checkoutUrl) throw new Error('missing checkout url');
      window.location.assign(data.checkoutUrl);
    } catch {
      setError('创建收款链接失败');
    } finally {
      setCheckoutPendingKey(null);
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
          billingDisabled={overview?.billingDisabled}
          pendingPlanKey={checkoutPendingKey}
          providerAvailability={overview?.providerAvailability}
          selectedProviders={selectedProviders}
          onProviderChange={(planKey, provider) => setSelectedProviders((current) => ({ ...current, [planKey]: provider }))}
          onCheckout={handleCheckout}
        />
      )}

      {!loading && activeSubscriptions.length > 0 ? (
        <section className="dashboard-surface dashboard-surface--padded">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>当前有效订阅</h2>
          <div className="mt-4 grid gap-3">
            {activeSubscriptions.map((subscription) => (
              <div key={subscription.id} className="dashboard-surface flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {subscription.tier ? getTierDefinition(subscription.tier).name : MODULE_LABELS[subscription.module] ?? subscription.module}
                  {' · '}{subscription.billingCycle === 'monthly' ? '月付' : '年付'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  有效至 {formatDateInTimeZone(subscription.currentPeriodEnd, { includeTime: false, includeYear: true })}
                  {' · '}{subscription.provider ?? 'unknown'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
