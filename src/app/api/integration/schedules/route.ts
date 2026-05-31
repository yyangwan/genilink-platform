import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/schedules`, {
    errorMessage: 'Failed to fetch schedules',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;

  const upstream = await fetchUpstream(result.ctx, `/api/schedules`, {
    method: 'POST',
    body: { project_id: result.ctx.projectId, ...rest },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create schedule',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
