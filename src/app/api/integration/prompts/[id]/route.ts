import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/prompts/${id}?project_id=${result.ctx.projectId}`, {
    method: 'DELETE',
    timeoutMs: 30_000,
    errorMessage: 'Failed to delete prompt',
  });
  if ('response' in upstream) return upstream.response;
  return new NextResponse(null, { status: 204 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts/${id}?project_id=${result.ctx.projectId}`, {
    method: 'PUT',
    body: { ...rest, project_id: result.ctx.projectId },
    timeoutMs: 30_000,
    errorMessage: 'Failed to update prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts/${id}?project_id=${result.ctx.projectId}`, {
    method: 'PATCH',
    body: { ...rest, project_id: result.ctx.projectId },
    timeoutMs: 30_000,
    errorMessage: 'Failed to update prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
