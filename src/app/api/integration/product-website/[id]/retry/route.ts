import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/product-website/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    timeoutMs: 30_000,
    errorMessage: 'Failed to retry product website analysis',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
