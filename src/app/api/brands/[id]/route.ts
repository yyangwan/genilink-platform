import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { prisma } from '@/lib/db';
import { syncBrandToVisibility, syncBrandDeleteToVisibility } from '@/lib/proxy/zhijian-client';

export const GET = withBrandRoute(async (_req, { workspaceId }, params) => {
  const { id } = params!;

  const brand = await prisma.brand.findFirst({
    where: { id, workspaceId, deletedAt: null },
  });

  if (!brand) {
    return NextResponse.json({ error: '品牌不存在' }, { status: 404 });
  }

  return NextResponse.json(brand);
});

export const PATCH = withBrandRoute(async (req, { workspaceId }, params) => {
  const { id } = params!;
  const body = await req.json();
  const { name, aliases, isCompetitor, logo, website, description } = body;

  const existing = await prisma.brand.findFirst({
    where: { id, workspaceId, deletedAt: null },
  });

  if (!existing) {
    return NextResponse.json({ error: '品牌不存在' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (aliases !== undefined) updates.aliases = aliases;
  if (isCompetitor !== undefined) updates.isCompetitor = isCompetitor;
  if (logo !== undefined) updates.logo = logo;
  if (website !== undefined) updates.website = website;
  if (description !== undefined) updates.description = description;

  let updated;
  try {
    updated = await prisma.brand.update({
      where: { id },
      data: updates,
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: '同名品牌已存在' }, { status: 409 });
    }
    throw err;
  }

  // Await sync to 智見
  const syncResult = await syncBrandToVisibility(updated, updated.remoteIds as Record<string, string> | null);

  // Update remote IDs
  if (Object.keys(syncResult.remoteIds).length > 0) {
    await prisma.brand.update({
      where: { id },
      data: { remoteIds: syncResult.remoteIds },
    });
    updated.remoteIds = syncResult.remoteIds;
  }

  const status = syncResult.synced === 'full' ? 200 : 207;
  return NextResponse.json(updated, { status });
});

export const DELETE = withBrandRoute(async (_req, { workspaceId }, params) => {
  const { id } = params!;

  const existing = await prisma.brand.findFirst({
    where: { id, workspaceId, deletedAt: null },
  });

  if (!existing) {
    return NextResponse.json({ error: '品牌不存在' }, { status: 404 });
  }

  // Soft delete
  await prisma.brand.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Fire-and-forget delete sync to 智見
  syncBrandDeleteToVisibility(existing, existing.remoteIds as Record<string, string> | null).catch((err) => {
    console.error(`[brand-sync] Background delete sync failed for brand ${id}:`, err.message);
  });

  return NextResponse.json({ success: true });
});
