import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ withdraw: vi.fn() }));
vi.mock('@/lib/marketing/leads', () => ({
  withdrawMarketingLeadContact: mocks.withdraw,
  LeadRateLimitError: class LeadRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) { super('LEAD_RATE_LIMITED'); }
  },
  LeadWithdrawalNotFoundError: class LeadWithdrawalNotFoundError extends Error {},
}));

import { DELETE } from '@/app/api/public/leads/[id]/contact/route';

describe('DELETE /api/public/leads/:id/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withdraw.mockResolvedValue({ withdrawnAt: new Date('2026-09-26T01:00:00Z'), alreadyWithdrawn: false });
  });

  it('withdraws contact consent using the private credential', async () => {
    const request = new NextRequest('http://localhost/api/public/leads/lead_1/contact', {
      method: 'DELETE', headers: { 'x-real-ip': '203.0.113.9' },
      body: JSON.stringify({ withdrawalToken: 'x'.repeat(43), reason: '不再需要联系' }),
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'lead_1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, withdrawnAt: '2026-09-26T01:00:00.000Z' });
    expect(mocks.withdraw).toHaveBeenCalledWith({
      leadId: 'lead_1', token: 'x'.repeat(43), reason: '不再需要联系', clientIp: '203.0.113.9',
    });
  });

  it('rejects an invalid request body', async () => {
    const request = new NextRequest('http://localhost/api/public/leads/lead_1/contact', {
      method: 'DELETE', body: JSON.stringify({ withdrawalToken: 'short' }),
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'lead_1' }) });
    expect(response.status).toBe(400);
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });
});
