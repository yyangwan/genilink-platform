import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { prisma } from '@/lib/db';
import { isUniqueViolation } from '@/lib/prisma-helpers';

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

  return NextResponse.json(brand, { status: 201 });
});
