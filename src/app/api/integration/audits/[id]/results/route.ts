import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(_req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/audits/${id}/results`, {
    errorMessage: 'Failed to fetch audit results',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
