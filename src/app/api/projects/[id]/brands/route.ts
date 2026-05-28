import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { syncBrandToProject, syncBrandDisassociate } from '@/lib/proxy/zhijian-client';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';
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

  const { brandId } = await req.json();
  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Verify brand belongs to same workspace and is not soft-deleted
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, workspaceId, deletedAt: null },
  });
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // Create association
  try {
    await prisma.projectBrand.create({
      data: { projectId, brandId },
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: '品牌已关联到此项目' }, { status: 409 });
    }
    throw err;
  }

  // Sync to 智見
  const syncResult = await syncBrandToProject(
    { id: brand.id, name: brand.name, aliases: brand.aliases, isCompetitor: brand.isCompetitor },
    projectId,
    (brand.remoteIds as Record<string, string>) ?? null,
  );

  if ('remoteIds' in syncResult && Object.keys(syncResult.remoteIds).length > 0) {
    await prisma.brand.update({
      where: { id: brand.id },
      data: { remoteIds: syncResult.remoteIds },
    });
  } else if ('error' in syncResult) {
    console.warn(`[brand-associate] Sync failed: ${syncResult.error}`);
  }

  return NextResponse.json({ success: true }, { status: 201 });
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

  const { brandId } = await req.json();
  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Delete association
  const deleted = await prisma.projectBrand.deleteMany({
    where: { projectId, brandId },
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
