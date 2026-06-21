import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { mapSuggestion } from './mapper';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const auditId = req.nextUrl.searchParams.get('auditId');
  const qs = auditId ? `?audit_id=${auditId}` : '';

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectId}${qs}`, {
    errorMessage: 'Failed to fetch suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion);
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectId}/generate`, {
    method: 'POST',
    timeoutMs: 60_000,
    errorMessage: 'Failed to generate suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion);
  return NextResponse.json(mapped);
}
