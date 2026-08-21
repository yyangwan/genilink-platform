import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(_req);
  if (!result.ok) return result.response;

  const { id } = await params;
  try {
    await assertMonthlyUsageQuota(result.ctx.session.user.id, result.ctx.workspaceId, 'visibility_audit');
  } catch (err) {
    if (err instanceof PlanLimitError) return planLimitResponse(err);
    throw err;
  }

  const upstream = await fetchUpstream(result.ctx, `/api/analysis/audits/${id}/analyze`, {
    method: 'POST',
    timeoutMs: 30_000,
    errorMessage: 'Failed to trigger analysis',
  });
  if ('response' in upstream) return upstream.response;

  await recordMonthlyUsage(result.ctx.session.user.id, result.ctx.workspaceId, 'visibility_audit', 1, {
    projectId: result.ctx.projectId,
    auditId: id,
  });

  return NextResponse.json(upstream.data);
}
