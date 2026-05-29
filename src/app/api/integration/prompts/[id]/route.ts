import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/projects/${result.ctx.projectPk}/prompts/${id}`, {
    method: 'DELETE',
    timeoutMs: 30_000,
    errorMessage: 'Failed to delete prompt',
  });
  if ('response' in upstream) return upstream.response;
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const upstream = await fetchUpstream(result.ctx, `/api/projects/${result.ctx.projectPk}/prompts/${id}`, {
    method: 'PATCH',
    body,
    timeoutMs: 30_000,
    errorMessage: 'Failed to update prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
