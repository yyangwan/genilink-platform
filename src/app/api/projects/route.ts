import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';

// GET /api/projects — list projects for current workspace
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  if (!workspaceId) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      externalMappings: {
        select: { service: true, externalId: true },
      },
    },
  });

  return NextResponse.json({ projects });
}

// POST /api/projects — create project in current workspace
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'No workspace selected' },
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

  const body = await req.json();
  const { name, url, industry, productName, productKeywords, productDescription, productUrl } = body;

  if (!name) {
    return NextResponse.json(
      { error: 'Project name is required' },
      { status: 400 }
    );
  }

  // Check for duplicate name in workspace
  const existing = await prisma.project.findUnique({
    where: { workspaceId_name: { workspaceId, name } },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Project with this name already exists in workspace' },
      { status: 409 }
    );
  }

  // Create project + external mappings in transaction
  const project = await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = await tx.project.create({
      data: {
        name,
        url: url || null,
        industry: industry || null,
        productName: productName || null,
        productKeywords: productKeywords || [],
        productDescription: productDescription || null,
        productUrl: productUrl || null,
        workspaceId,
      } as any,
    });

    await tx.externalResourceMapping.createMany({
      data: [
        {
          projectId: proj.id,
          service: 'visibility',
          externalId: nanoid(12),
        },
        {
          projectId: proj.id,
          service: 'content',
          externalId: nanoid(12),
        },
      ],
    });

    return proj;
  });

  return NextResponse.json({ project }, { status: 201 });
}
