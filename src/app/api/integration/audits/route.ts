import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';

// GET /api/integration/audits?projectId=xxx — list audits for a project
export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectId}/audits-history`, {
    errorMessage: 'Failed to fetch audits',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

// POST /api/integration/audits — create a new audit for a project
export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  // Fetch brands associated with this project via ProjectBrand
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

  const upstream = await fetchUpstream(result.ctx, `/api/audits`, {
    method: 'POST',
    body: {
      project_id: result.ctx.projectId,
      brands,
    },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create audit',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
