import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { mapSuggestion } from '../mapper';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectId}`, {
    errorMessage: 'Failed to fetch suggestion',
  });
  if ('response' in upstream) return upstream.response;

  const suggestions = Array.isArray(upstream.data) ? upstream.data : [];
  const suggestion = suggestions.find((item) => String((item as Record<string, unknown>).id) === id);
  if (!suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  return NextResponse.json(mapSuggestion(suggestion as Record<string, unknown>));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
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
