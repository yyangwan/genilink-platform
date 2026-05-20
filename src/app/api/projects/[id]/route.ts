import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

interface ProjectRow {
  id: string;
  name: string;
  url: string | null;
  industry: string | null;
  productName: string | null;
  productKeywords: string[];
  productDescription: string | null;
  productUrl: string | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  externalMappings?: Array<{ service: string; externalId: string }>;
}

function formatProject(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    industry: p.industry,
    productName: p.productName,
    productKeywords: p.productKeywords,
    productDescription: p.productDescription,
    productUrl: p.productUrl,
    workspaceId: p.workspaceId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    externalMappings: (p.externalMappings || []).map((m) => ({
      service: m.service,
      externalId: m.externalId,
    })),
  };
}

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
  }) as unknown as ProjectRow | null;

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

  return NextResponse.json({ project: formatProject(project) });
}

// PATCH /api/projects/[id] — update project (edit mode)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Verify project exists and user has access
  const project = await prisma.project.findFirst({
    where: { id },
  }) as unknown as ProjectRow | null;

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId: project.workspaceId },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Check duplicate name (excluding current project)
  if (body.name && body.name !== project.name) {
    const existing = await prisma.project.findUnique({
      where: { workspaceId_name: { workspaceId: project.workspaceId, name: body.name } },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Project with this name already exists' },
        { status: 409 }
      );
    }
  }

  // Build update data from provided fields
  const data: Record<string, unknown> = {};
  const allowedFields = ['name', 'url', 'industry', 'productName', 'productKeywords', 'productDescription', 'productUrl'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  const updated = await prisma.project.update({
    where: { id },
    data,
    include: { externalMappings: true },
  }) as unknown as ProjectRow;

  return NextResponse.json({ project: formatProject(updated) });
}
