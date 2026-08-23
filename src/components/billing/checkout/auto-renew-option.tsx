'use client';

import { RefreshCw } from 'lucide-react';
import { formatCents } from '@/lib/billing/format';

const AGREEMENT_VERSION = 'auto-renew-v1.0';
export const AUTO_RENEW_AGREEMENT_VERSION = AGREEMENT_VERSION;

type Props = {
  available: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled: boolean;
  renewalAmountCents: number;
  nextBillingDateLabel: string | null;
};

/**
 * Auto-renew opt-in (spec §12.1): user action + explicit agreement acceptance.
 * Rendered ONLY when the selected channel supports recurring charges — never
 * pre-checked (spec §15).
 */
export function AutoRenewOption({
  available,
  enabled,
  onToggle,
  disabled,
  renewalAmountCents,
  nextBillingDateLabel,
}: Props) {
  if (!available) return null;

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: enabled ? 'var(--color-primary)' : 'var(--border)', background: 'var(--bg-card)' }}
    >
      <label className="flex cursor-pointer items-start gap-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <RefreshCw className="h-3.5 w-3.5" />
            开启自动续期
          </span>
          <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {enabled && nextBillingDateLabel
              ? `下次扣款：${nextBillingDateLabel}，金额 ${formatCents(renewalAmountCents)}。`
              : `到期自动按 ${formatCents(renewalAmountCents)} 续费，可随时关闭，关闭后当前周期继续有效。`}
          </span>
          {enabled ? (
            <span className="mt-1.5 block text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
              勾选即表示同意《自动续费委托扣款服务协议》(v{AGREEMENT_VERSION.replace('auto-renew-', '')})，
              支付成功后生效。
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}
