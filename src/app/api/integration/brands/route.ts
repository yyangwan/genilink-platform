import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  // Fetch brands associated with this project via ProjectBrand join table
  const associations = await prisma.projectBrand.findMany({
    where: { projectId: result.ctx.projectId },
    include: { brand: true },
  });

  const brands = associations
    .filter(a => a.brand && !a.brand.deletedAt)
    .map(a => ({
      id: a.brand.id,
      name: a.brand.name,
      aliases: a.brand.aliases || [],
      is_competitor: a.brand.isCompetitor || false,
    }));

  return NextResponse.json(brands);
}

// POST, PATCH, DELETE — brands are now managed via /api/brands directly
export async function POST() {
  return NextResponse.json(
    { error: 'Use /api/brands to create brands' },
    { status: 410 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Use /api/brands to update brands' },
    { status: 410 },
  );
}
