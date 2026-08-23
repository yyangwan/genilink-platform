import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/billing/renewals/service', () => ({
  runRenewalBatch: vi.fn().mockResolvedValue({
    expiredSessions: 0,
    expiredGrace: 0,
    attemptsCreated: 0,
    claimed: 0,
    results: [],
  }),
}));

import { POST } from '@/app/api/internal/billing/renewals/run/route';
import { runRenewalBatch } from '@/lib/billing/renewals/service';

function runRequest(secret?: string) {
  return new NextRequest('http://localhost/api/internal/billing/renewals/run', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe('POST /api/internal/billing/renewals/run (spec §8.7)', () => {
  afterEach(() => {
    delete process.env.BILLING_CRON_SECRET;
  });

  it('returns 503 when BILLING_CRON_SECRET is not configured', async () => {
    const response = await POST(runRequest('anything'));
    expect(response.status).toBe(503);
    expect(runRenewalBatch).not.toHaveBeenCalled();
  });

  it('returns 401 without a bearer token', async () => {
    process.env.BILLING_CRON_SECRET = 'cron-secret-1';
    const response = await POST(runRequest());
    expect(response.status).toBe(401);
  });

  it('returns 401 with the wrong token', async () => {
    process.env.BILLING_CRON_SECRET = 'cron-secret-1';
    const response = await POST(runRequest('wrong'));
    expect(response.status).toBe(401);
  });

  it('runs the batch with the right secret', async () => {
    process.env.BILLING_CRON_SECRET = 'cron-secret-1';
    const response = await POST(runRequest('cron-secret-1'));
    expect(response.status).toBe(200);
    expect(runRenewalBatch).toHaveBeenCalledTimes(1);
    const data = await response.json();
    expect(data).toHaveProperty('workerId');
    expect(data).toHaveProperty('claimed');
  });
});
