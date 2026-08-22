import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { scopeHistoryPayload } from '@/lib/billing/scope';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectId}/audits-history`, {
    errorMessage: 'Failed to fetch audit history',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(scopeHistoryPayload(upstream.data, result.ctx.billing.capabilities.trendHistoryDays));
}
