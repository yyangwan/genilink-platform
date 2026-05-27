import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { syncBrandDisassociate } from '@/lib/proxy/zhijian-client';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

// Verify user has access to the brand's workspace
async function verifyBrandAccess(userId: string, brandId: string) {
  const workspaceId = await getWorkspaceId(userId);
  if (!workspaceId) return null;

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

  const { projectId } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const deleted = await prisma.projectBrand.deleteMany({
    where: { brandId, projectId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Association not found' }, { status: 404 });
  }

  // Sync disassociation to 智見
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (brand) {
    const syncResult = await syncBrandDisassociate(
      { id: brand.id },
      projectId,
      (brand.remoteIds as Record<string, string>) ?? null,
    );

    if ('remoteIds' in syncResult) {
      await prisma.brand.update({
        where: { id: brand.id },
        data: { remoteIds: syncResult.remoteIds },
      });
    }
  }

  return NextResponse.json({ success: true });
}
