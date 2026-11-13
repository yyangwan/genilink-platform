import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

export class QuickCheckError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export function miniJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function quickCheckRoute(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof QuickCheckError) {
      const response = miniJson({ code: error.code, error: error.message }, error.status);
      if (error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
      return response;
    }
    console.error('Mini-program quick check failed', error instanceof Error ? error.name : 'unknown');
    return miniJson({ code: 'QUICK_CHECK_UNAVAILABLE', error: '服务暂不可用，请稍后重试' }, 503);
  }
}

export async function readMiniBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 8192;
  const invalid = new QuickCheckError(400, 'INVALID_REQUEST', '请检查提交内容');
  if (!request.body) throw invalid;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new QuickCheckError(413, 'BODY_TOO_LARGE', '提交内容过长');
      }
      body += decoder.decode(value, { stream: true });
    }
    const parsed: unknown = JSON.parse(body + decoder.decode());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid;
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof QuickCheckError) throw error;
    throw invalid;
  } finally {
    reader.releaseLock();
  }
}

export function visitorHash(token: string) {
  return createHash('sha256').update(`mini-visitor:${token}`).digest('hex');
}

export function miniIpHash(request: Request) {
  const secret = process.env.MARKETING_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new QuickCheckError(503, 'QUICK_CHECK_UNAVAILABLE', '服务暂不可用');
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return createHmac('sha256', secret).update(`mini-ip:${ip}`).digest('hex');
}

export function readIdempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new QuickCheckError(400, 'INVALID_IDEMPOTENCY_KEY', '操作标识无效，请重试');
  }
  return createHash('sha256').update(key).digest('hex');
}

export function requireQuickCheckEnabled() {
  if (process.env.MINI_PROGRAM_QUICK_CHECK_ENABLED !== 'true') {
    throw new QuickCheckError(503, 'QUICK_CHECK_DISABLED', '官网快检暂未开放');
  }
}
