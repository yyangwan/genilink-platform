import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';
import { AssociationError, changeBrandAssociation, attemptAssociationDelivery } from '@/lib/visibility/project-brand-associations';
import { ContextConflict } from '@/lib/visibility/project-context';
import { isUniqueViolation } from '@/lib/prisma-helpers';

// Verify user owns the project (with workspace membership check)
async function verifyProjectAccess(userId: string, projectId: string) {
  const workspaceId = await getWorkspaceId(userId);
  if (!workspaceId) return null;

  const isMember = await validateWorkspaceAccess(userId, workspaceId);
  if (!isMember) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  return project ? workspaceId : null;
}

// GET /api/projects/[id]/brands — list brands associated with a project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;
  const workspaceId = await verifyProjectAccess(session.user.id, projectId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const associations = await prisma.projectBrand.findMany({
    where: { projectId },
    include: { brand: true },
    orderBy: { createdAt: 'desc' },
  });

  // Filter out soft-deleted brands (eng review E1: preserve associations, filter in query)
  const brands = associations
    .filter((a) => a.brand && a.brand.deletedAt === null)
    .map((a) => a.brand);

  return NextResponse.json({ brands });
}

// POST /api/projects/[id]/brands — associate a brand with a project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;
  const workspaceId = await verifyProjectAccess(session.user.id, projectId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const input = await req.json().catch(() => null);
  const brandId = input?.brandId;
  if (typeof brandId !== 'string' || !brandId || brandId.length > 100) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Verify brand belongs to same workspace and is not soft-deleted
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, workspaceId, deletedAt: null },
  });
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const actor = { userId: session.user.id, workspaceId, projectId };
  try {
    const context = await changeBrandAssociation(actor, brandId, 'associate');
    return NextResponse.json({ success: true, contextVersion: context.version, syncPending: await attemptAssociationDelivery(actor) }, { status: 201 });
  } catch (error) {
    if (error instanceof AssociationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ContextConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    if (isUniqueViolation(error)) return NextResponse.json({ error: '品牌已关联到此项目' }, { status: 409 });
    throw error;
  }
}

// DELETE /api/projects/[id]/brands — disassociate a brand from a project
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;
  const workspaceId = await verifyProjectAccess(session.user.id, projectId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const input = await req.json().catch(() => null);
  const brandId = input?.brandId;
  if (typeof brandId !== 'string' || !brandId || brandId.length > 100) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  const actor = { userId: session.user.id, workspaceId, projectId };
  try {
    const context = await changeBrandAssociation(actor, brandId, 'remove');
    return NextResponse.json({ success: true, contextVersion: context.version, syncPending: await attemptAssociationDelivery(actor) });
  } catch (error) {
    if (error instanceof AssociationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ContextConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
