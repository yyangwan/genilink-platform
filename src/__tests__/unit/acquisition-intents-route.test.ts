import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createAcquisitionIntent: vi.fn(),
}));

vi.mock('@/lib/marketing/acquisition', () => ({
  AcquisitionRateLimitError: class AcquisitionRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
      super('ACQUISITION_RATE_LIMITED');
    }
  },
  createAcquisitionIntent: mocks.createAcquisitionIntent,
}));

import { POST } from '@/app/api/public/acquisition/intents/route';

describe('POST /api/public/acquisition/intents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.createAcquisitionIntent.mockResolvedValue({
      visitorToken: 'v'.repeat(43),
      intentId: 'intent-1',
      expiresAt: new Date('2026-09-26T00:00:00Z'),
      nextUrl: '/auth/login?callbackUrl=%2Fstart',
    });
  });

  it('creates an intent and writes opaque HttpOnly cookies', async () => {
    const response = await POST(new NextRequest('https://genilink.cn/api/public/acquisition/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.10' },
      body: JSON.stringify({ kind: 'website_diagnosis', targetUrl: 'https://example.com' }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      intentId: 'intent-1',
      nextUrl: '/auth/login?callbackUrl=%2Fstart',
    });
    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('genilink-acq=');
    expect(cookies).toContain('genilink-intent=intent-1');
    expect(cookies).toContain('HttpOnly');
  });

  it('rejects invalid JSON before calling the service', async () => {
    const response = await POST(new NextRequest('https://genilink.cn/api/public/acquisition/intents', {
      method: 'POST',
      body: '{bad',
    }));

    expect(response.status).toBe(400);
    expect(mocks.createAcquisitionIntent).not.toHaveBeenCalled();
  });

  it('rejects declared oversized bodies', async () => {
    const response = await POST(new NextRequest('https://genilink.cn/api/public/acquisition/intents', {
      method: 'POST',
      headers: { 'content-length': '9000' },
      body: '{}',
    }));

    expect(response.status).toBe(413);
    expect(mocks.createAcquisitionIntent).not.toHaveBeenCalled();
  });

  it('honors the acquisition kill switch', async () => {
    vi.stubEnv('ACQUISITION_ENABLED', 'false');
    const response = await POST(new NextRequest('https://genilink.cn/api/public/acquisition/intents', {
      method: 'POST',
      body: '{}',
    }));

    expect(response.status).toBe(503);
    expect(mocks.createAcquisitionIntent).not.toHaveBeenCalled();
  });
});
