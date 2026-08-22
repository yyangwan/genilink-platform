import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';
import { scopeHistoryPayload } from '@/lib/billing/scope';

// GET /api/integration/audits?projectId=xxx — list audits for a project
export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectId}/audits-history`, {
    errorMessage: 'Failed to fetch audits',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(scopeHistoryPayload(
    upstream.data,
    result.ctx.billing.capabilities.trendHistoryDays,
  ));
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

  try {
    await assertMonthlyUsageQuota(result.ctx.session.user.id, result.ctx.workspaceId, 'visibility_audit');
  } catch (err) {
    if (err instanceof PlanLimitError) return planLimitResponse(err);
    throw err;
  }

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

  await recordMonthlyUsage(result.ctx.session.user.id, result.ctx.workspaceId, 'visibility_audit', 1, {
    projectId: result.ctx.projectId,
  });

  return NextResponse.json(upstream.data);
}
