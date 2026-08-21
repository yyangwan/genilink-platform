import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req, { requireProject: false });
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
  const access = await getWorkspaceBillingAccess(result.ctx.session.user.id, result.ctx.workspaceId);
  const existing = await fetchUpstream(result.ctx, `/api/schedules`, {
    errorMessage: 'Failed to fetch schedules',
  });
  if ('response' in existing) return existing.response;

  const existingSchedules = Array.isArray(existing.data) ? existing.data : [];
  if (existingSchedules.length >= access.limits.scheduledAudits) {
    return NextResponse.json(
      {
        error: 'PLAN_LIMIT_EXCEEDED',
        feature: 'scheduled_audits',
        used: existingSchedules.length,
        limit: access.limits.scheduledAudits,
      },
      { status: 402 },
    );
  }

  const upstream = await fetchUpstream(result.ctx, `/api/schedules`, {
    method: 'POST',
    body: { project_id: result.ctx.projectId, ...rest },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create schedule',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
