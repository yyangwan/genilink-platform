import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

// GET /api/projects/[id] — return single project with external mappings
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  const { id } = await params;

  // Verify workspace membership
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, workspaceId },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });
    }
  }

  // Fetch project, ensuring user has access via workspace membership
  const project = await prisma.project.findFirst({
    where: { id },
    include: { externalMappings: true },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify the user has access to this project's workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      workspaceId: project.workspaceId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      url: project.url,
      industry: project.industry,
      workspaceId: project.workspaceId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      externalMappings: project.externalMappings.map((m) => ({
        service: m.service,
        externalId: m.externalId,
      })),
    },
  });
}
