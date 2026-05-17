import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

// GET /api/workspaces — list user's workspaces
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          industry: true,
          createdAt: true,
          _count: {
            select: {
              members: true,
              projects: true,
            },
          },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    industry: m.workspace.industry,
    role: m.role,
    memberCount: m.workspace._count.members,
    projectCount: m.workspace._count.projects,
    createdAt: m.workspace.createdAt,
  }));

  return NextResponse.json({ workspaces });
}

// PATCH /api/workspaces — update workspace name
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { workspaceId, name } = body;

  if (!workspaceId || !name?.trim()) {
    return NextResponse.json(
      { error: 'workspaceId and name are required' },
      { status: 400 }
    );
  }

  // Verify the user is an owner of this workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId, role: 'owner' },
  });

  if (!membership) {
    return NextResponse.json(
      { error: 'Only workspace owners can update settings' },
      { status: 403 }
    );
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: name.trim() },
    select: { id: true, name: true },
  });

  return NextResponse.json({ workspace: updated });
}
