import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('@/lib/billing/service', () => ({ syncBillingPlans: mocks.sync }));

import { POST } from '@/app/api/internal/billing/catalog/sync/route';

describe('POST /api/internal/billing/catalog/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('BILLING_CRON_SECRET', 'billing-secret');
    mocks.sync.mockResolvedValue(undefined);
  });

  it('requires internal billing authentication', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/billing/catalog/sync', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('synchronizes the catalog before deployment health validation', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/billing/catalog/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer billing-secret' },
    }));
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.data.offerId).toBe('public-launch-2026-09');
    expect(body.data.currency).toBe('CNY');
    expect(body.data.plans).toHaveLength(6);
    expect(body.data.plans.map((plan: { priceCents: number }) => plan.priceCents)).toEqual([
      9_900, 99_900, 39_900, 399_900, 129_900, 1_299_900,
    ]);
  });

  it('fails closed when catalog persistence fails', async () => {
    mocks.sync.mockRejectedValue(new Error('database unavailable'));
    const response = await POST(new NextRequest('http://localhost/api/internal/billing/catalog/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer billing-secret' },
    }));
    expect(response.status).toBe(500);
  });
});
