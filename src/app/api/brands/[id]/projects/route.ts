import { NextRequest, NextResponse } from 'next/server';
import { AssociationError, changeBrandAssociation, attemptAssociationDelivery } from '@/lib/visibility/project-brand-associations';
import { ContextConflict } from '@/lib/visibility/project-context';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';

// Verify user has access to the brand's workspace
async function verifyBrandAccess(userId: string, brandId: string) {
  const workspaceId = await getWorkspaceId(userId);
  if (!workspaceId) return null;

  const isMember = await validateWorkspaceAccess(userId, workspaceId);
  if (!isMember) return null;

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, workspaceId, deletedAt: null },
  });
  return brand ? workspaceId : null;
}

// GET /api/brands/[id]/projects — list projects associated with a brand
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: brandId } = await params;
  const workspaceId = await verifyBrandAccess(session.user.id, brandId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const associations = await prisma.projectBrand.findMany({
    where: { brandId },
    include: { project: true },
    orderBy: { createdAt: 'desc' },
  });

  const projects = associations.map((a) => a.project);

  return NextResponse.json({ projects });
}

// DELETE /api/brands/[id]/projects — disassociate brand from a project (reverse direction)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: brandId } = await params;
  const workspaceId = await verifyBrandAccess(session.user.id, brandId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const input = await req.json().catch(() => null);
  const projectId = input?.projectId;
  if (typeof projectId !== 'string' || !projectId || projectId.length > 100) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
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
