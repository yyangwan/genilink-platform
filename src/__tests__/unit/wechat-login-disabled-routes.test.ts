import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as callbackPost } from '@/app/api/auth/wechat/callback/route';
import { GET as qrcodeGet } from '@/app/api/auth/wechat/qrcode/route';
import { GET as statusGet } from '@/app/api/auth/wechat/status/route';
import { POST as verifyPost } from '@/app/api/auth/wechat/verify/route';
import { prisma } from '@/lib/db';

describe('disabled WeChat login routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WECHAT_LOGIN_ENABLED', 'false');
  });

  it.each([
    ['qrcode', () => qrcodeGet()],
    [
      'status',
      () => statusGet(new Request('http://localhost/api/auth/wechat/status?scene=test') as never),
    ],
    [
      'verify',
      () => verifyPost(new Request('http://localhost/api/auth/wechat/verify', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
      }) as never),
    ],
    [
      'callback POST',
      () => callbackPost(new Request('http://localhost/api/auth/wechat/callback', {
        method: 'POST',
        body: '<xml></xml>',
      }) as never),
    ],
  ])('returns 404 from %s without touching login sessions', async (_name, request) => {
    const response = await request();

    expect(response.status).toBe(404);
    expect(prisma.wechatLoginSession.findUnique).not.toHaveBeenCalled();
    expect(prisma.wechatLoginSession.create).not.toHaveBeenCalled();
    expect(prisma.wechatLoginSession.update).not.toHaveBeenCalled();
    expect(prisma.wechatLoginSession.delete).not.toHaveBeenCalled();
  });
});
