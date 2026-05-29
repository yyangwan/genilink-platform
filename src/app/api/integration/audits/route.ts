import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

// GET /api/integration/audits?projectId=xxx — list audits for a project
export async function GET(req: NextRequest) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectPk}/audits-history`, {
    errorMessage: 'Failed to fetch audits',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

// POST /api/integration/audits — create a new audit for a project
export async function POST(req: NextRequest) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/audits`, {
    method: 'POST',
    body: { project_id: result.ctx.projectPk },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create audit',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
