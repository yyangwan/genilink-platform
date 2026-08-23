import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/analysis/audits/${id}/analysis`, {
    errorMessage: 'Failed to fetch audit analysis',
  });
  if ('response' in upstream) return upstream.response;

  return NextResponse.json(upstream.data);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(_req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/analysis/audits/${id}/analyze`, {
    method: 'POST',
    timeoutMs: 30_000,
    errorMessage: 'Failed to trigger analysis',
  });
  if ('response' in upstream) return upstream.response;

  return NextResponse.json(upstream.data);
}
