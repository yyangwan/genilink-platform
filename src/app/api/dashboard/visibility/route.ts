import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { scopeCitationReport } from '@/lib/visibility/report-scope';
import { hasCapabilityLevel } from '@/lib/billing/tiers';
import type { CitationDashboard } from '@/types/citation-dashboard';

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'auditReport' });
  if (!guard.ok) return guard.response;
  const upstream = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/dashboard`, { errorMessage: '可见性概览暂不可用' });
  if ('response' in upstream) return upstream.response;
  const data = upstream.data as CitationDashboard;
  if (data?.schema !== 'citation-dashboard-1' || data.project_id !== guard.ctx.projectId || data.report && (data.report.schema !== 'citation-report-1' || data.report.project_id !== data.project_id || data.report.audit_id !== data.latest_audit?.id)) return NextResponse.json({ error: '概览上下文不匹配' }, { status: 502 });
  const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) > 0;
  return NextResponse.json({ ...data, report: data.report ? scopeCitationReport(data.report, guard.ctx.billing.capabilities.auditReport, pending) : null,
    context_sync_pending: pending, can_capture: data.enabled && !pending && ['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role) && hasCapabilityLevel(guard.ctx.billing.capabilities.contentInsights, 'full') }, { headers: { 'Cache-Control': 'no-store' } });
}
