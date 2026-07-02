import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

const ALLOWED_RANGES = new Set(['7d', '30d', '90d']);

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const requestedRange = req.nextUrl.searchParams.get('range') || '30d';
  const range = ALLOWED_RANGES.has(requestedRange) ? requestedRange : '30d';
  const upstream = await fetchUpstream(
    result.ctx,
    `/api/product-website/projects/${encodeURIComponent(result.ctx.projectId)}/trends?range=${encodeURIComponent(range)}`,
    { errorMessage: 'Failed to fetch product website trends' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
