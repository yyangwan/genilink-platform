import { beforeEach, describe, expect, it, vi } from 'vitest';

const bcrypt = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: bcrypt }));

const sms = vi.hoisted(() => ({
  sendLoginCode: vi.fn(),
  verifyLoginCode: vi.fn(),
}));
vi.mock('@/lib/auth/sms-verification', () => ({
  ...sms,
  SmsRateLimitError: class SmsRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
      super('SMS_RATE_LIMITED');
    }
  },
}));

import { GET, PATCH, POST, PUT } from '@/app/api/user/login-credentials/route';
import { prisma } from '@/lib/db';
import { SmsRateLimitError } from '@/lib/auth/sms-verification';

function request(method: 'POST' | 'PATCH', body: unknown) {
  return new Request('http://localhost/api/user/login-credentials', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/user/login-credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
    delete (globalThis as { __mockAuthSession?: unknown }).__mockAuthSession;
    bcrypt.hash.mockResolvedValue('new-hash');
    sms.verifyLoginCode.mockResolvedValue({ id: 'test-user-id' });
    vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue({
      phone: '+8613800138000',
      loginEmail: null,
      passwordHash: null,
    } as never);
    vi.mocked(prisma.user.updateMany).mockReset();
  });

  it('requires an authenticated phone-created account', async () => {
    (globalThis as { __mockAuthSession?: unknown }).__mockAuthSession = null;

    const response = await GET();
    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('reports whether email password login is configured', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loginEmail: 'user@example.com',
      passwordHash: 'stored-hash',
    } as never);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: 'user@example.com',
      configured: true,
    });
  });

  it('binds a normalized email and hashed password exactly once', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });

    const response = await POST(request('POST', {
      email: ' User@Example.COM ',
      password: 'password123',
      verificationCode: '123456',
    }) as never);

    expect(response.status).toBe(200);
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'test-user-id', loginEmail: null, passwordHash: null },
      data: { loginEmail: 'user@example.com', passwordHash: 'new-hash' },
    });
  });

  it('does not bind credentials when phone verification fails', async () => {
    sms.verifyLoginCode.mockResolvedValueOnce(null);

    const response = await POST(request('POST', {
      email: 'user@example.com',
      password: 'password123',
      verificationCode: '000000',
    }) as never);

    expect(response.status).toBe(400);
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects repeated binding and duplicate email addresses', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      phone: '+8613800138000',
      loginEmail: 'user@example.com',
      passwordHash: 'stored-hash',
    } as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({ count: 0 });
    const repeated = await POST(request('POST', {
      email: 'user@example.com',
      password: 'password123',
      verificationCode: '123456',
    }) as never);
    expect(repeated.status).toBe(409);

    vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue({
      phone: '+8613800138000',
      loginEmail: null,
      passwordHash: null,
    } as never);
    const duplicateError = Object.assign(new Error('duplicate'), { code: 'P2002' });
    vi.mocked(prisma.user.updateMany).mockReset().mockRejectedValueOnce(duplicateError);
    const duplicate = await POST(request('POST', {
      email: 'used@example.com',
      password: 'password123',
      verificationCode: '123456',
    }) as never);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({ error: '该邮箱已被其他账号使用' });
  });

  it('changes the password only after checking the current password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: null,
      loginEmail: 'user@example.com',
      passwordHash: 'stored-hash',
    } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }]);
    bcrypt.compare.mockResolvedValue(true);

    const response = await PATCH(request('PATCH', {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    }) as never);

    expect(response.status).toBe(200);
    expect(bcrypt.compare).toHaveBeenCalledWith('old-password', 'stored-hash');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'test-user-id' },
      data: { passwordHash: 'new-hash' },
    });
  });

  it('does not change the password when the current password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: null,
      loginEmail: 'user@example.com',
      passwordHash: 'stored-hash',
    } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }]);
    bcrypt.compare.mockResolvedValue(false);

    const response = await PATCH(request('PATCH', {
      currentPassword: 'wrong-password',
      newPassword: 'new-password',
    }) as never);

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('sends a verification code only to the signed-in account phone', async () => {
    sms.sendLoginCode.mockResolvedValue({ expiresInSeconds: 300, retryAfterSeconds: 60 });

    const response = await PUT(new Request('http://localhost/api/user/login-credentials', {
      method: 'PUT',
      headers: { 'x-real-ip': '203.0.113.8' },
    }) as never);

    expect(response.status).toBe(200);
    expect(sms.sendLoginCode).toHaveBeenCalledWith('+8613800138000', '203.0.113.8');
  });

  it('preserves SMS retry guidance for credential binding', async () => {
    sms.sendLoginCode.mockRejectedValue(new SmsRateLimitError(42));

    const response = await PUT(new Request('http://localhost/api/user/login-credentials', {
      method: 'PUT',
    }) as never);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
  });
});
