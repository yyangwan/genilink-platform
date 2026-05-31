import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts/generate`, {
    method: 'POST',
    body: { ...rest, project_id: result.ctx.projectId },
    timeoutMs: 30_000,
    errorMessage: 'Failed to generate prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
