import { NextResponse } from 'next/server';
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
