import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectId}/audits-history`, {
    errorMessage: 'Failed to fetch audit history',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
