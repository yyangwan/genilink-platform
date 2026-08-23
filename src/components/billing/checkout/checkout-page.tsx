'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { CheckoutSessionView } from '@/lib/billing/checkout/service';
import type { BillingProvider } from '@/types/billing';
import { formatCents } from '@/lib/billing/format';
import { OrderSummary } from '@/components/billing/checkout/order-summary';
import { CouponForm } from '@/components/billing/checkout/coupon-form';
import { PaymentMethods } from '@/components/billing/checkout/payment-methods';
import { AutoRenewOption, AUTO_RENEW_AGREEMENT_VERSION } from '@/components/billing/checkout/auto-renew-option';
import { PaymentStage } from '@/components/billing/checkout/payment-stage';

const POLL_INTERVAL_MS = 2500;

type Props = {
  initialSession: CheckoutSessionView;
  workspaceName?: string | null;
};

export function CheckoutPage({ initialSession, workspaceName }: Props) {
  const [session, setSession] = useState(initialSession);
  const [selectedProvider, setSelectedProvider] = useState<BillingProvider | null>(
    (initialSession.payment?.provider as BillingProvider | undefined) ?? null,
  );
  const [autoRenew, setAutoRenew] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessSyncedRef = useRef(false);

  const refreshSession = useCallback(async () => {
    const response = await fetch(`/api/billing/checkout-sessions/${session.id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { checkoutSession: CheckoutSessionView };
    setSession(data.checkoutSession);
    return data.checkoutSession;
  }, [session.id]);

  // Polling indicator is DERIVED from the session status — the effect only
  // runs the interval, no synchronous setState (remediation §4.11.3).
  const polling = session.status === 'processing';

  // Poll while a payment attempt is in flight; pause when the tab is hidden
  // (spec §14.3).
  useEffect(() => {
    if (session.status !== 'processing') return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (document.hidden) return;
      await refreshSession();
    };

    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session.status, refreshSession]);

  // Sync billing access after completion so gated UI updates immediately.
  useEffect(() => {
    if (session.status !== 'completed' || accessSyncedRef.current) return;
    accessSyncedRef.current = true;
    fetch('/api/billing/access', { method: 'POST' }).catch(() => undefined);
  }, [session.status]);

  const availableProviders = useMemo(
    () =>
      Object.entries(session.providerAvailability)
        .filter(([, value]) => value.oneTime)
        .map(([key]) => key as BillingProvider),
    [session.providerAvailability],
  );

  // Default selection is DERIVED at render time (adjust-state-during-render)
  // instead of a synchronous setState in an effect (remediation §4.11.3).
  const effectiveProvider: BillingProvider | null =
    selectedProvider && availableProviders.includes(selectedProvider)
      ? selectedProvider
      : (availableProviders[0] ?? null);

  const recurringAvailable = useMemo(
    () =>
      effectiveProvider
        ? Boolean(session.providerAvailability[effectiveProvider]?.autoRenew)
        : false,
    [session.providerAvailability, effectiveProvider],
  );

  const handleConfirm = useCallback(
    async (options: { forceNewAttempt?: boolean } = {}) => {
      if (!effectiveProvider || confirming) return;
      setConfirming(true);
      setError(null);
      try {
        const response = await fetch(`/api/billing/checkout-sessions/${session.id}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            provider: effectiveProvider,
            autoRenew,
            agreementAcceptedVersion: autoRenew ? AUTO_RENEW_AGREEMENT_VERSION : null,
            forceNewAttempt: options.forceNewAttempt ?? false,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          payment?: { presentation?: string; redirectUrl?: string | null };
          error?: { code?: string; message?: string };
        };

        if (!response.ok) {
          setError(data.error?.message ?? '发起支付失败，请重试或切换支付方式。');
          await refreshSession().catch(() => undefined);
          return;
        }

        if (data.payment?.presentation === 'redirect' && data.payment.redirectUrl) {
          window.location.assign(data.payment.redirectUrl);
          return;
        }
        await refreshSession();
      } catch {
        setError('网络异常，请重试。');
      } finally {
        setConfirming(false);
      }
    },
    [effectiveProvider, confirming, session.id, autoRenew, refreshSession],
  );

  const handleApplyCoupon = useCallback(
    async (code: string): Promise<string | null> => {
      const response = await fetch(`/api/billing/checkout-sessions/${session.id}/coupon`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        checkoutSession?: CheckoutSessionView;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !data.checkoutSession) {
        return data.error?.code ?? 'COUPON_NOT_FOUND';
      }
      setSession(data.checkoutSession);
      return null;
    },
    [session.id],
  );

  const handleRemoveCoupon = useCallback(async () => {
    const response = await fetch(`/api/billing/checkout-sessions/${session.id}/coupon`, {
      method: 'DELETE',
    });
    const data = (await response.json().catch(() => ({}))) as {
      checkoutSession?: CheckoutSessionView;
    };
    if (response.ok && data.checkoutSession) {
      setSession(data.checkoutSession);
    }
  }, [session.id]);

  const modifiable = session.status === 'ready';
  const canConfirm = modifiable && Boolean(effectiveProvider) && !confirming;
  const lastAttemptFailed =
    session.payment && ['failed', 'canceled', 'expired'].includes(session.payment.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/settings/billing" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft className="h-4 w-4" />
          返回套餐
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          安全支付
        </span>
      </header>

      <h1 className="mt-6 text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
        收银台
      </h1>

      {/* ─── Result states ─── */}
      {session.status === 'completed' ? (
        <ResultCard
          tone="success"
          title="支付成功，订阅已开通"
          description={
            session.autoRenew && session.agreementStatus !== 'active'
              ? '订阅已开通，自动续期未开启。如需自动续期，请在订阅管理中重新开启。'
              : session.subscription
                ? `有效期至 ${formatDate(session.subscription.currentPeriodEnd)}。`
                : undefined
          }
          href="/settings/billing"
          actionLabel="前往订阅管理"
        />
      ) : session.status === 'expired' ? (
        <ResultCard
          tone="muted"
          title="结算会话已过期"
          description="本次结算已超时，请返回套餐页重新发起购买。"
          href="/settings/billing"
          actionLabel="返回套餐页"
        />
      ) : session.status === 'failed' || session.status === 'canceled' ? (
        <ResultCard
          tone="error"
          title="支付未完成"
          description="本次结算已终止，请返回套餐页重新发起。"
          href="/settings/billing"
          actionLabel="返回套餐页"
        />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
          {/* Left: summary + coupon */}
          <div className="space-y-4">
            <OrderSummary session={session} workspaceName={workspaceName} />
            {modifiable || session.coupon ? (
              <CouponForm
                disabled={!modifiable}
                appliedCode={session.coupon?.code ?? null}
                onApply={handleApplyCoupon}
                onRemove={handleRemoveCoupon}
              />
            ) : null}
          </div>

          {/* Right: pay */}
          <div className="space-y-4">
            <section
              className="space-y-4 rounded-xl border p-5"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
              aria-label="支付"
            >
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>支付方式</h2>
              <PaymentMethods
                availability={session.providerAvailability}
                selected={effectiveProvider}
                onSelect={(provider) => {
                  setSelectedProvider(provider);
                  setAutoRenew(false);
                }}
                disabled={!modifiable || confirming}
              />

              <AutoRenewOption
                available={recurringAvailable}
                enabled={autoRenew}
                onToggle={setAutoRenew}
                disabled={!modifiable || confirming}
                renewalAmountCents={session.quote.renewalAmountCents}
                nextBillingDateLabel={null}
              />

              {error ? (
                <p className="inline-flex items-start gap-1.5 text-xs leading-5" style={{ color: 'var(--color-error)' }}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}

              {lastAttemptFailed ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  上次支付未完成，可切换支付方式后重试，无需重新下单。
                </p>
              ) : null}

              {session.status === 'ready' ? (
                <button
                  type="button"
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
                  disabled={!canConfirm}
                  onClick={() => void handleConfirm()}
                >
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  立即支付 {formatCents(session.quote.amountDueCents)}
                </button>
              ) : null}
            </section>

            {session.status === 'processing' && session.payment ? (
              <PaymentStage
                provider={(session.payment.provider as BillingProvider) ?? null}
                presentation={session.payment.presentation}
                codeUrl={session.payment.codeUrl}
                redirectUrl={session.payment.redirectUrl}
                attemptStatus={session.payment.status}
                expiresAt={session.payment.expiresAt ?? session.expiresAt}
                polling={polling}
                busy={confirming}
                onRefresh={() => void handleConfirm({ forceNewAttempt: true })}
                onContinueAlipay={(url) => window.location.assign(url)}
              />
            ) : null}

            <p className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Clock className="h-3 w-3" />
              结算会话有效期至 {formatDateTime(session.expiresAt)}，超时需重新发起。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function ResultCard(props: {
  tone: 'success' | 'error' | 'muted';
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
}) {
  const iconColor =
    props.tone === 'success'
      ? 'var(--color-primary)'
      : props.tone === 'error'
        ? 'var(--color-error)'
        : 'var(--text-muted)';
  return (
    <div
      className="mt-6 rounded-xl border p-8 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {props.tone === 'success' ? (
        <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: iconColor }} />
      ) : (
        <AlertTriangle className="mx-auto h-10 w-10" style={{ color: iconColor }} />
      )}
      <h2 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{props.title}</h2>
      {props.description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          {props.description}
        </p>
      ) : null}
      <Link
        href={props.href}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg px-6 text-sm font-semibold"
        style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
      >
        {props.actionLabel}
      </Link>
    </div>
  );
}
