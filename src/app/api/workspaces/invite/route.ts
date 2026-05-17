import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

// POST /api/workspaces/invite — invite a member by email
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { workspaceId, email } = body;

  if (!workspaceId || !email?.trim()) {
    return NextResponse.json(
      { error: 'workspaceId and email are required' },
      { status: 400 }
    );
  }

  // Verify inviter is a member (owner or admin)
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId, role: { in: ['owner', 'admin'] } },
  });

  if (!membership) {
    return NextResponse.json(
      { error: 'You do not have permission to invite members' },
      { status: 403 }
    );
  }

  // Check if the invited user exists
  const invitedUser = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!invitedUser) {
    return NextResponse.json(
      { error: '该邮箱用户不存在' },
      { status: 404 }
    );
  }

  // Check if already a member
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: invitedUser.id },
  });

  if (existingMember) {
    return NextResponse.json(
      { error: '该用户已是工作区成员' },
      { status: 409 }
    );
  }

  // Add user directly as member
  await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: invitedUser.id,
      role: 'member',
    },
  });

  return NextResponse.json({ success: true, invitedEmail: email });
}
