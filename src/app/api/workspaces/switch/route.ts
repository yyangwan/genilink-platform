import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

// POST /api/workspaces/switch — switch active workspace
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { workspaceId } = body;

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing workspaceId' },
      { status: 400 }
    );
  }

  // Verify membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId },
  });

  if (!membership) {
    return NextResponse.json(
      { error: 'Not a member of this workspace' },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true, workspaceId });

  response.cookies.set('genilink-workspace', workspaceId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
  });

  // Clear project cookie since projects are workspace-scoped
  response.cookies.set('genilink-project', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
