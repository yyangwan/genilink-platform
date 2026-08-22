import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { mapSuggestion } from './mapper';
import { suggestionResultLimit } from '@/lib/billing/scope';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req, { capability: 'optimizationAdvice' });
  if (!result.ok) return result.response;

  const auditId = req.nextUrl.searchParams.get('auditId');
  const qs = auditId ? `?audit_id=${auditId}` : '';

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectId}${qs}`, {
    errorMessage: 'Failed to fetch suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const limit = suggestionResultLimit(result.ctx.billing.capabilities.optimizationAdvice);
  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion).slice(0, limit);
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req, { capability: 'optimizationAdvice' });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectId}/generate`, {
    method: 'POST',
    timeoutMs: 60_000,
    errorMessage: 'Failed to generate suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const limit = suggestionResultLimit(result.ctx.billing.capabilities.optimizationAdvice);
  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion).slice(0, limit);
  return NextResponse.json(mapped);
}
