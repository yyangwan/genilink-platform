import { NextRequest, NextResponse } from 'next/server';
import {
  AcquisitionRateLimitError,
  createAcquisitionIntent,
} from '@/lib/marketing/acquisition';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8 * 1024;

function clientIp(request: Request): string {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function POST(request: NextRequest) {
  if (process.env.ACQUISITION_ENABLED === 'false') {
    return NextResponse.json({ error: '获客诊断正在维护', code: 'ACQUISITION_DISABLED' }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '请求内容过大', code: 'BODY_TOO_LARGE' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '请求内容过大', code: 'BODY_TOO_LARGE' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: '请求格式不正确', code: 'INVALID_JSON' }, { status: 400 });
  }

  try {
    const result = await createAcquisitionIntent({
      body,
      visitorToken: request.cookies.get('genilink-acq')?.value,
      clientIp: clientIp(request),
    });
    const response = NextResponse.json({
      intentId: result.intentId,
      expiresAt: result.expiresAt,
      nextUrl: result.nextUrl,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
    response.cookies.set('genilink-acq', result.visitorToken, {
      ...cookieOptions,
      maxAge: 90 * 24 * 60 * 60,
    });
    response.cookies.set('genilink-intent', result.intentId, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof AcquisitionRateLimitError) {
      return NextResponse.json(
        { error: '提交过于频繁，请稍后重试', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message, code: 'INVALID_INTENT' }, { status: 400 });
    }
    console.error('Failed to create acquisition intent', error);
    return NextResponse.json({ error: '暂时无法创建诊断，请稍后重试', code: 'INTENT_CREATE_FAILED' }, { status: 503 });
  }
}
