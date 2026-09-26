import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/marketing/leads', () => ({
  createMarketingLead: mocks.create,
  LeadRateLimitError: class LeadRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) { super('LEAD_RATE_LIMITED'); }
  },
}));

import { POST } from '@/app/api/public/leads/route';

const validLead = {
  kind: 'agency', companyName: '示例公司', email: 'owner@example.com',
  contactConsent: true, privacyVersion: '2026-09-26', submissionToken: crypto.randomUUID(),
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/public/leads', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.8' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/public/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.create.mockResolvedValue({ lead: { id: 'lead_1' }, withdrawalToken: 'withdrawal-token' });
  });

  it('creates a lead and returns only its identifier', async () => {
    const response = await POST(request(validLead));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, leadId: 'lead_1', withdrawalToken: 'withdrawal-token' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ companyName: '示例公司' }), expect.objectContaining({ clientIp: '203.0.113.8' }));
  });

  it('silently accepts a populated honeypot without creating a lead', async () => {
    const response = await POST(request({ ...validLead, submissionToken: crypto.randomUUID(), companyFax: 'bot-data' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects malformed leads before calling the service', async () => {
    const response = await POST(request({ ...validLead, submissionToken: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('honors the independent lead form switch', async () => {
    vi.stubEnv('LEAD_FORMS_ENABLED', 'false');
    const response = await POST(request(validLead));
    expect(response.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
