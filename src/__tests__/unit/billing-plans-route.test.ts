import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/billing/plans/route';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/billing/catalog', () => ({
  BILLING_PLAN_SEEDS: [
    {
      key: 'suite-lite-monthly',
      module: 'suite',
      billingCycle: 'monthly',
      name: 'Visibility Monthly',
      description: 'Configured test plan',
      priceCents: 100,
      currency: 'CNY',
      provider: 'wechatpay',
      checkoutUrl: null,
      isActive: true,
      sortOrder: 10,
    },
    {
      key: 'suite-pro-monthly',
      module: 'suite',
      billingCycle: 'monthly',
      name: 'Content Monthly',
      description: 'Unpriced test plan',
      priceCents: 0,
      currency: 'CNY',
      provider: 'alipay',
      checkoutUrl: null,
      isActive: true,
      sortOrder: 20,
    },
  ],
}));

vi.mock('@/lib/billing/gateways', () => ({
  isPaymentProviderConfigured: vi.fn((provider: string) => provider === 'alipay'),
}));

vi.mock('@/lib/billing/service', () => ({
  syncBillingPlans: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

describe('GET /api/billing/plans', () => {
  it('marks priced plans configured when any selectable payment provider is available', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerAvailability).toEqual({
      wechatpay: false,
      alipay: true,
    });
    expect(body.plans).toEqual([
      expect.objectContaining({
        key: 'suite-lite-monthly',
        tier: 'lite',
        configured: true,
      }),
      expect.objectContaining({
        key: 'suite-pro-monthly',
        tier: 'pro',
        configured: false,
      }),
    ]);
  });
});
