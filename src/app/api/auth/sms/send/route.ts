import { NextResponse } from 'next/server';
import { sendLoginCode, SmsRateLimitError } from '@/lib/auth/sms-verification';

export const runtime = 'nodejs';

function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  try {
    const result = await sendLoginCode(
      typeof body === 'object' && body ? (body as { phone?: unknown }).phone : undefined,
      clientIp(request)
    );
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof TypeError && error.message === 'INVALID_PHONE') {
      return NextResponse.json({ error: '请输入正确的中国大陆手机号' }, { status: 400 });
    }
    if (error instanceof SmsRateLimitError) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后重试', retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }

    console.error('Failed to send login SMS', error);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 503 });
  }
}
