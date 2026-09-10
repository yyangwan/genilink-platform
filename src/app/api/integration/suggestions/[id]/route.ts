import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { loadCanonicalSuggestion } from '@/lib/content/canonical-suggestion';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  // 规范建议读取与 Brief 创建共用同一服务端 loader（设计 §17.1）。
  const loaded = await loadCanonicalSuggestion({
    identity: {
      userId: result.ctx.session.user.id,
      role: result.ctx.role,
    },
    workspaceId: result.ctx.workspaceId,
    projectId: result.ctx.projectId,
    suggestionId: id,
  });

  if (!loaded.ok) {
    return NextResponse.json(
      { error: loaded.code },
      { status: loaded.code === 'SUGGESTION_NOT_FOUND' ? 404 : 502 },
    );
  }
  return NextResponse.json(loaded.suggestion);
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
