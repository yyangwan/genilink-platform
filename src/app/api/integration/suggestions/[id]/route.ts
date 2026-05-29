import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(_req, { requireProject: false });
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${id}`, {
    errorMessage: 'Failed to fetch suggestion',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req, { requireProject: false });
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${id}/resolve`, {
    method: 'PATCH',
    timeoutMs: 30_000,
    errorMessage: 'Failed to update suggestion',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(_req, { requireProject: false });
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${id}`, {
    method: 'DELETE',
    timeoutMs: 30_000,
    errorMessage: 'Failed to delete suggestion',
  });
  if ('response' in upstream) return upstream.response;
  return new NextResponse(null, { status: 204 });
}
