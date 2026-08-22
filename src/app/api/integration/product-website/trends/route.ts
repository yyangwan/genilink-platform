import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

const ALLOWED_RANGES = new Set(['7d', '30d', '90d']);

function allowedRange(requestedRange: string, historyDays: number): string {
  const requestedDays = Number.parseInt(requestedRange, 10);
  const cappedDays = Math.min(Number.isFinite(requestedDays) ? requestedDays : 30, historyDays);
  if (cappedDays <= 7) return '7d';
  if (cappedDays <= 30) return '30d';
  return '90d';
}

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const requestedRange = req.nextUrl.searchParams.get('range') || '30d';
  const normalizedRange = ALLOWED_RANGES.has(requestedRange) ? requestedRange : '30d';
  const range = allowedRange(normalizedRange, result.ctx.billing.capabilities.trendHistoryDays);
  const upstream = await fetchUpstream(
    result.ctx,
    `/api/product-website/projects/${encodeURIComponent(result.ctx.projectId)}/trends?range=${encodeURIComponent(range)}`,
    { errorMessage: 'Failed to fetch product website trends' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
