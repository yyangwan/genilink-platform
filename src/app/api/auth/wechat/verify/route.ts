import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encode } from 'next-auth/jwt';

const AUTH_SECRET =
  process.env.AUTH_SECRET || 'change-me-to-a-secure-random-string';

export async function POST(req: NextRequest) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  // Look up the login session by token
  const session = await prisma.wechatLoginSession.findUnique({
    where: { token },
  });

  if (!session || session.status !== 'confirmed' || !session.userId) {
    return NextResponse.json(
      { error: 'Invalid or expired login token' },
      { status: 401 }
    );
  }

  if (new Date() > session.expiresAt) {
    await prisma.wechatLoginSession
      .delete({ where: { token } })
      .catch(() => {});
    return NextResponse.json(
      { error: 'Login token expired' },
      { status: 401 }
    );
  }

  // One-time use: delete after exchange
  const userId = session.userId;
  await prisma.wechatLoginSession
    .delete({ where: { token } })
    .catch(() => {});

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get workspace info for the user
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });

  // Create NextAuth JWT session token
  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email ?? undefined,
    workspaceId: membership?.workspaceId,
    role: membership?.role,
  };

  const sessionToken = await encode({
    token: jwtPayload,
    secret: AUTH_SECRET,
    salt: 'authjs.session-token',
  });

  // Set session cookie and return success
  const response = NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email },
  });

  response.cookies.set('authjs.session-token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return response;
}
