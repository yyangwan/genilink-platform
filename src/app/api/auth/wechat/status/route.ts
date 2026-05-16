import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const scene = req.nextUrl.searchParams.get('scene');

  if (!scene) {
    return NextResponse.json({ error: 'Missing scene' }, { status: 400 });
  }

  const session = await prisma.wechatLoginSession.findUnique({
    where: { scene },
  });

  if (!session) {
    return NextResponse.json({ status: 'expired' });
  }

  if (new Date() > session.expiresAt) {
    await prisma.wechatLoginSession.delete({ where: { scene } }).catch(() => {});
    return NextResponse.json({ status: 'expired' });
  }

  if (session.status === 'confirmed' && session.token) {
    return NextResponse.json({ status: 'confirmed', token: session.token });
  }

  return NextResponse.json({ status: session.status as 'pending' | 'scanned' });
}
