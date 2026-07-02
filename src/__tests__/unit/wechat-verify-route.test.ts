/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/auth/wechat/verify/route';
import { prisma } from '@/lib/db';
import { encode } from 'next-auth/jwt';

vi.mock('next-auth/jwt', () => ({
  encode: vi.fn().mockResolvedValue('signed-session-token'),
}));

function mockRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/auth/wechat/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/wechat/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'test-secret');

    (prisma.wechatLoginSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      token: 'login-token',
      status: 'confirmed',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.wechatLoginSession.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      name: 'User One',
      email: 'user@example.com',
    });
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      workspaceId: 'workspace-1',
      role: 'owner',
    });
  });

  it('sets the production Auth.js secure session cookie with matching JWT salt', async () => {
    const res = await POST(mockRequest({ token: 'login-token' }) as any);

    expect(res.status).toBe(200);
    expect(encode).toHaveBeenCalledWith(expect.objectContaining({
      salt: '__Secure-authjs.session-token',
      secret: 'test-secret',
    }));
    expect(res.headers.get('set-cookie')).toContain('__Secure-authjs.session-token=signed-session-token');
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });
});
