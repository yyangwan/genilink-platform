import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendLoginCode } = vi.hoisted(() => ({
  sendLoginCode: vi.fn(),
}));

vi.mock('@/lib/auth/sms-verification', () => ({
  sendLoginCode,
  SmsRateLimitError: class SmsRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
      super('SMS_RATE_LIMITED');
    }
  },
}));

import { POST } from '@/app/api/auth/sms/send/route';
import { SmsRateLimitError } from '@/lib/auth/sms-verification';

function request(body: unknown, headers?: Record<string, string>) {
  return new Request('http://localhost/api/auth/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sms/send', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a login code without exposing it in the response', async () => {
    sendLoginCode.mockResolvedValue({ expiresInSeconds: 300, retryAfterSeconds: 60 });

    const response = await POST(request(
      { phone: '13800138000' },
      { 'x-real-ip': '203.0.113.10' }
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expiresInSeconds: 300, retryAfterSeconds: 60 });
    expect(sendLoginCode).toHaveBeenCalledWith('13800138000', '203.0.113.10');
  });

  it('returns a retry hint when rate limited', async () => {
    sendLoginCode.mockRejectedValue(new SmsRateLimitError(42));

    const response = await POST(request({ phone: '13800138000' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toMatchObject({ retryAfterSeconds: 42 });
  });

  it('rejects invalid JSON', async () => {
    const response = await POST(new Request('http://localhost/api/auth/sms/send', {
      method: 'POST',
      body: '{',
    }));

    expect(response.status).toBe(400);
    expect(sendLoginCode).not.toHaveBeenCalled();
  });
});
