/**
 * 内部服务回调鉴权（设计 §10.8，D8 决策）：
 * 共享密钥 Bearer + timingSafeEqual。
 * 密钥未配置时返回 503（fail-closed），不落回明文比较。
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function secretsMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyInternalServiceAuth(
  req: NextRequest | Request,
  secretEnvName: 'CONTENT_USAGE_CALLBACK_SECRET' | 'BILLING_CRON_SECRET' | 'MARKETING_CRON_SECRET',
): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env[secretEnvName];
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'SECRET_NOT_CONFIGURED', message: '内部回调未配置鉴权密钥' } },
        { status: 503 },
      ),
    };
  }
  const received = req.headers.get('authorization') ?? '';
  if (!secretsMatch(received, `Bearer ${secret}`)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '内部回调鉴权失败' } },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}
