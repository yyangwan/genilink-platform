'use client';

import { CreditCard, Wallet } from 'lucide-react';
import type { BillingProvider } from '@/types/billing';

type Props = {
  availability: Record<string, { oneTime: boolean; autoRenew: boolean }>;
  selected: BillingProvider | null;
  onSelect: (provider: BillingProvider) => void;
  disabled: boolean;
};

const PROVIDERS: Array<{
  key: BillingProvider;
  label: string;
  description: string;
  icon: typeof Wallet;
}> = [
  { key: 'wechatpay', label: '微信支付', description: '扫码支付', icon: Wallet },
  { key: 'alipay', label: '支付宝', description: '跳转支付', icon: CreditCard },
];

export function PaymentMethods({ availability, selected, onSelect, disabled }: Props) {
  const options = PROVIDERS.filter((provider) => availability[provider.key]?.oneTime);

  if (options.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        支付渠道尚未配置，请稍后再试。
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="支付方式">
      {options.map((provider) => {
        const isSelected = selected === provider.key;
        return (
          <button
            key={provider.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={
              isSelected
                ? {
                    borderColor: 'var(--color-primary)',
                    background: 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
                  }
                : { borderColor: 'var(--border)', background: 'var(--bg-card)' }
            }
            onClick={() => onSelect(provider.key)}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <provider.icon className="h-4 w-4" />
              {provider.label}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {provider.description}
              {availability[provider.key]?.autoRenew ? ' · 支持自动续期' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
