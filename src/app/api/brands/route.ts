import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { prisma } from '@/lib/db';
import { syncBrandToVisibility } from '@/lib/proxy/zhijian-client';
import { isUniqueViolation } from '@/lib/prisma-helpers';

type BrandSyncResult = {
  synced: 'full' | 'partial' | 'failed' | 'skipped';
  remoteIds: Record<string, string>;
  errors: string[];
};

export const GET = withBrandRoute(async (_req, { workspaceId }) => {
  const brands = await prisma.brand.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
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
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: '同名品牌已存在' }, { status: 409 });
    }
    throw err;
  }

  // Sync to 智見 only if brand has project associations
  // (brands created without association are "orphans" — synced when associated later)
  const associationCount = await prisma.projectBrand.count({
    where: { brandId: brand.id },
  });

  let syncResult: BrandSyncResult;
  if (associationCount === 0) {
    syncResult = { synced: 'skipped', remoteIds: {}, errors: [] };
  } else {
    const result = await syncBrandToVisibility(brand, null);
    syncResult = result;
  }

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
