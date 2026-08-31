import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth/config';
import { normalizeEmail, validatePassword, verifyEmailPassword } from '@/lib/auth/email-password';
import { prisma } from '@/lib/db';
import { sendLoginCode, SmsRateLimitError, verifyLoginCode } from '@/lib/auth/sms-verification';

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

async function authenticatedUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function clientIp(request: Request): string {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginEmail: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: '账号不存在' }, { status: 404 });

  return NextResponse.json({
    email: user.loginEmail,
    configured: Boolean(user.loginEmail && user.passwordHash),
  });
}

export async function POST(req: NextRequest) {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const email = normalizeEmail((body as { email?: unknown })?.email);
  const password = validatePassword((body as { password?: unknown })?.password);
  const verificationCode = (body as { verificationCode?: unknown })?.verificationCode;
  if (!email) return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
  if (!password) {
    return NextResponse.json({ error: '密码至少 8 个字符，且不能超过 72 字节' }, { status: 400 });
  }


  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, loginEmail: true, passwordHash: true },
  });
  if (!currentUser) return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  if (currentUser.loginEmail || currentUser.passwordHash) {
    return NextResponse.json({ error: '邮箱密码登录已经设置，不能重复绑定' }, { status: 409 });
  }
  if (!currentUser.phone) {
    return NextResponse.json({ error: '当前账号没有可验证的手机号' }, { status: 400 });
  }
  const verifiedUser = await verifyLoginCode(currentUser.phone, verificationCode);
  if (verifiedUser?.id !== userId) {
    return NextResponse.json({ error: '短信验证码无效或已过期' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await prisma.user.updateMany({
      where: { id: userId, loginEmail: null, passwordHash: null },
      data: { loginEmail: email, passwordHash },
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: '邮箱密码登录已经设置，不能重复绑定' }, { status: 409 });
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ email, configured: true });
}

export async function PUT(req: NextRequest) {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user?.phone) return NextResponse.json({ error: '当前账号没有可验证的手机号' }, { status: 400 });

  try {
    const result = await sendLoginCode(user.phone, clientIp(req));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SmsRateLimitError) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后重试', retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    console.error('Failed to send credential binding SMS', error);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const currentPassword = (body as { currentPassword?: unknown })?.currentPassword;
  const newPassword = validatePassword((body as { newPassword?: unknown })?.newPassword);
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
  }
  if (!newPassword) {
    return NextResponse.json({ error: '新密码至少 8 个字符，且不能超过 72 字节' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginEmail: true, passwordHash: true },
  });
  if (!user?.loginEmail || !user.passwordHash) {
    return NextResponse.json({ error: '请先设置邮箱密码登录' }, { status: 400 });
  }
  if (!(await verifyEmailPassword(user.loginEmail, currentPassword, clientIp(req)))) {
    return NextResponse.json({ error: '当前密码错误' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  return NextResponse.json({ success: true });
}
