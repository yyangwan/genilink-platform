import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(
    result.ctx,
    `/api/strategic/projects/${result.ctx.projectId}/structure-evolution`,
    { errorMessage: 'Failed to fetch structure evolution' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
