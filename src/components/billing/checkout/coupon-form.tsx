'use client';

import { useState } from 'react';
import { Loader2, TicketX, X } from 'lucide-react';

type Props = {
  disabled: boolean;
  appliedCode: string | null;
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => Promise<void>;
};

const ERROR_MESSAGES: Record<string, string> = {
  COUPON_NOT_FOUND: '优惠码不存在',
  COUPON_INACTIVE: '优惠码已停用',
  COUPON_NOT_STARTED: '优惠活动尚未开始',
  COUPON_EXPIRED: '优惠码已过期',
  COUPON_NOT_ELIGIBLE: '优惠码不适用于当前套餐',
  COUPON_MINIMUM_NOT_MET: '订单金额未达到优惠最低消费',
  COUPON_REDEMPTION_LIMIT_REACHED: '优惠码已被领完',
  COUPON_ALREADY_USED: '优惠码已使用过',
  CHECKOUT_SESSION_EXPIRED: '结算会话已过期，请返回套餐页重新发起',
  CHECKOUT_SESSION_NOT_MODIFIABLE: '当前状态下不能修改优惠码',
};

export function CouponForm({ disabled, appliedCode, onApply, onRemove }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || busy) return;
    setBusy(true);
    setError(null);
    const message = await onApply(normalized);
    if (message) {
      setError(message);
    } else {
      setCode('');
    }
    setBusy(false);
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    await onRemove();
    setBusy(false);
  };

  if (appliedCode) {
    return (
      <section
        className="flex items-center justify-between rounded-xl border p-4"
        style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 45%, var(--border))', background: 'var(--bg-card)' }}
        aria-label="已使用优惠码"
      >
        <div className="text-sm">
          <span className="font-semibold tracking-wide" style={{ color: 'var(--color-primary)' }}>
            {appliedCode}
          </span>
          <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            已应用
          </span>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
          disabled={disabled || busy}
          onClick={handleRemove}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          移除
        </button>
      </section>
    );
  }

  return (
    <section aria-label="优惠码">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleApply();
            }
          }}
          placeholder="输入优惠码"
          disabled={disabled || busy}
          className="min-h-11 flex-1 rounded-lg border bg-transparent px-3 text-sm tracking-wide uppercase outline-none placeholder:normal-case focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          aria-label="优惠码"
        />
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          disabled={disabled || busy || !code.trim()}
          onClick={handleApply}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '使用'}
        </button>
      </div>
      {error ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-error)' }}>
          <TicketX className="h-3.5 w-3.5" />
          {ERROR_MESSAGES[error] ?? '优惠码使用失败'}
        </p>
      ) : null}
    </section>
  );
}
