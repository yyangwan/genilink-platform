import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const rawLimit = req.nextUrl.searchParams.get('limit') || '20';
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);

  const upstream = await fetchUpstream(
    result.ctx,
    `/api/trends/${result.ctx.externalId}/audits-history?limit=${limit}`,
    { errorMessage: 'Failed to fetch audits history' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
