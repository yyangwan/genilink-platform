import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const auditId = req.nextUrl.searchParams.get('auditId');
  const qs = auditId ? `?audit_id=${auditId}` : '';

  const upstream = await fetchUpstream(
    result.ctx,
    `/api/strategic/projects/${result.ctx.projectId}/competitor-positioning${qs}`,
    { errorMessage: 'Failed to fetch competitor positioning' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
