import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { verifyEmailPassword } from '@/lib/auth/email-password';
import { verifyLoginCode } from '@/lib/auth/sms-verification';
import { isWechatLoginServerEnabled } from '@/lib/auth/wechat-login-server';
import { createWebPair, requireBindingEnabled } from '@/lib/mini-program/identity';
import { miniJson, QuickCheckError, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';

export function POST(request: NextRequest) {
  return quickCheckRoute(async () => {
    requireBindingEnabled();
    const allowedOrigins = [request.nextUrl.origin, process.env.AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]
      .flatMap((value) => {
        try { return value ? [new URL(value).origin] : []; } catch { return []; }
      });
    if (!allowedOrigins.includes(request.headers.get('origin') ?? '')) {
      throw new QuickCheckError(403, 'INVALID_ORIGIN', '请从智链工作台操作');
    }
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new QuickCheckError(401, 'UNAUTHORIZED', '请登录已有智链账号');
    const body = await readMiniBody(request);
    if (body.method === 'official' && isWechatLoginServerEnabled()
      && process.env.WECHAT_MP_APPID && process.env.WECHAT_MP_SECRET && process.env.WECHAT_MP_TOKEN
      && typeof body.proof === 'string' && /^[0-9a-f]{64}$/.test(body.proof)) {
      return miniJson(await createWebPair(userId, body.proof));
    }
    const verified = body.method === 'email'
      ? await verifyEmailPassword(body.email, body.password, request.headers.get('x-real-ip') || 'unknown')
      : body.method === 'phone' ? await verifyLoginCode(body.phone, body.code, userId) : null;
    if (verified?.id !== userId) {
      throw new QuickCheckError(401, 'ACCOUNT_PROOF_REQUIRED', '请重新验证当前智链账号');
    }
    return miniJson(await createWebPair(userId));
  });
}
