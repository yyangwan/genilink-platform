'use client';

import { AlertCircle, BadgePercent, Receipt } from 'lucide-react';
import { formatCents } from '@/lib/billing/format';
import type { CheckoutSessionView } from '@/lib/billing/checkout/service';

type Props = {
  session: CheckoutSessionView;
  workspaceName?: string | null;
};

const PURCHASE_TYPE_LABELS: Record<string, string> = {
  new: '新订阅',
  upgrade: '套餐升级',
  manual_renewal: '手动续费',
};

export function OrderSummary({ session, workspaceName }: Props) {
  const quote = session.quote;
  const cycleLabel = session.plan.billingCycle === 'yearly' ? '年付' : '月付';
  const renewalRestored =
    quote.discountCents > 0 && quote.renewalAmountCents > quote.amountDueCents;

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      aria-label="订单摘要"
    >
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Receipt className="h-4 w-4" />
          订单摘要
        </h2>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            color: 'var(--color-primary)',
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
          }}
        >
          {PURCHASE_TYPE_LABELS[session.purchaseType] ?? session.purchaseType}
        </span>
      </div>

      <div className="mt-4">
        <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {session.plan.name}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {cycleLabel}
          {workspaceName ? ` · ${workspaceName}` : ' · 当前工作空间'}
        </div>
      </div>

      <dl className="mt-5 space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <dt style={{ color: 'var(--text-secondary)' }}>原价</dt>
          <dd style={{ color: 'var(--text-primary)' }}>{formatCents(quote.subtotalCents)}</dd>
        </div>
        {quote.discountCents > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <BadgePercent className="h-3.5 w-3.5" />
              优惠{session.coupon ? `（${session.coupon.code}）` : ''}
            </dt>
            <dd style={{ color: 'var(--color-primary)' }}>-{formatCents(quote.discountCents)}</dd>
          </div>
        ) : null}
        <div
          className="flex items-center justify-between border-t pt-3 text-base font-semibold"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <dt>本次应付</dt>
          <dd style={{ color: 'var(--color-primary)' }}>{formatCents(quote.amountDueCents)}</dd>
        </div>
      </dl>

      {renewalRestored ? (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          优惠仅作用于本次支付，续费将恢复 {formatCents(quote.renewalAmountCents)}。
        </p>
      ) : null}

      {session.autoRenew ? (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          已开启自动续期：到期后按 {formatCents(quote.renewalAmountCents)} 自动扣款，可随时在订阅管理中关闭。
        </p>
      ) : null}

      {session.purchaseType === 'upgrade' ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-lg border p-3 text-xs leading-5"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-warning)' }} />
          <span>升级后新的订阅周期将从支付成功时开始，原套餐剩余周期不折算。</span>
        </div>
      ) : null}
    </section>
  );
}
