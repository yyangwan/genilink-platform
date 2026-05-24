import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { prisma } from '@/lib/db';
import { syncBrandToVisibility } from '@/lib/proxy/zhijian-client';

export const GET = withBrandRoute(async (_req, { workspaceId }) => {
  const brands = await prisma.brand.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(brands);
});

export const POST = withBrandRoute(async (req, { workspaceId }) => {
  const body = await req.json();
  const { name, aliases, isCompetitor, logo, website, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: '品牌名称不能为空' }, { status: 400 });
  }

  // Create brand (partial unique index catches duplicate active names)
  let brand;
  try {
    brand = await prisma.brand.create({
      data: {
        name: name.trim(),
        aliases: aliases ?? [],
        isCompetitor: isCompetitor ?? false,
        logo: logo ?? null,
        website: website ?? null,
        description: description ?? null,
        workspaceId,
      },
    });
  } catch (err: unknown) {
    // P2002 = unique constraint violation
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: '同名品牌已存在' }, { status: 409 });
    }
    throw err;
  }

  // Await sync to 智見 (prevents race with visibility preflight)
  const syncResult = await syncBrandToVisibility(brand, null);

  // Store remote IDs from sync
  if (Object.keys(syncResult.remoteIds).length > 0) {
    await prisma.brand.update({
      where: { id: brand.id },
      data: { remoteIds: syncResult.remoteIds },
    });
    brand.remoteIds = syncResult.remoteIds;
  }

  const status = syncResult.synced === 'full' ? 201 : 207;
  return NextResponse.json(brand, { status });
});
