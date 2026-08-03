// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BillingSettingsPage from '@/app/(dashboard)/settings/billing/page';
import { AccountSubscriptionPlans } from '@/components/billing/account-subscription-plans';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('checkout=success&orderId=order-123'),
}));

describe('BillingSettingsPage', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/billing/plans') {
        return new Response(JSON.stringify({
          workspaceId: 'workspace-1',
          plans: [],
          subscriptions: [],
          billingDisabled: false,
          providerAvailability: {},
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/billing/access') {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs access without showing a persistent order message, then clears checkout parameters', async () => {
    render(<BillingSettingsPage />);

    expect(screen.queryByText(/支付完成后会自动刷新订阅权益/)).toBeNull();
    expect(screen.queryByText(/订单号：order-123/)).toBeNull();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/billing/access', { method: 'POST' });
      expect(replace).toHaveBeenCalledWith('/settings/billing');
    });
  });

  it('uses pointer cursors for enabled subscription controls', () => {
    render(
      <AccountSubscriptionPlans
        plans={[{
          id: 'plan-pro',
          key: 'suite-pro-monthly',
          tier: 'pro',
          billingCycle: 'monthly',
          priceCents: 9900,
          currency: 'CNY',
          provider: 'wechatpay',
          configured: true,
        }]}
        billingCycle="monthly"
        onBillingCycleChange={vi.fn()}
        currentTier="lite"
        providerAvailability={{ wechatpay: true, alipay: true }}
        selectedProviders={{ 'suite-pro-monthly': 'wechatpay' }}
        onProviderChange={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '月付' }).className).toContain('cursor-pointer');
    expect(screen.getByRole('button', { name: '微信支付' }).className).toContain('cursor-pointer');
    expect(screen.getByRole('button', { name: '升级到专业版' }).className).toContain('cursor-pointer');
  });
});
