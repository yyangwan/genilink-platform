import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { scopeCitationReport } from '@/lib/visibility/report-scope';
import { hasCapabilityLevel } from '@/lib/billing/tiers';
import type { AnalysisWorkspace, WorkspaceView } from '@/types/analysis-workspace';

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view');
  const auditId = req.nextUrl.searchParams.get('auditId');
  if (!view || !['insights', 'suggestions', 'compare', 'strategic'].includes(view) || auditId !== null && !/^[1-9][0-9]{0,17}$/.test(auditId)) return NextResponse.json({ error: '无效的分析视图或审计编号' }, { status: 400 });
  const capability = ({ insights: 'contentInsights', suggestions: 'optimizationAdvice', compare: 'competitorComparison', strategic: 'strategicIntelligence' } as const)[view as WorkspaceView];
  const guard = await resolveGuard(req, { capability });
  if (!guard.ok) return guard.response;
  const query = auditId ? `?audit_id=${auditId}` : '';
  const upstream = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/workspace${query}`, { errorMessage: '分析工作台暂不可用' });
  if ('response' in upstream) return upstream.response;
  const data = upstream.data as AnalysisWorkspace;
  if (data?.schema !== 'citation-workspace-1' || data.project_id !== guard.ctx.projectId || auditId && data.enabled && data.selected_audit_id !== auditId || data.report && (data.report.schema !== 'citation-report-1' || data.report.project_id !== data.project_id || data.report.audit_id !== data.selected_audit_id)) return NextResponse.json({ error: '分析快照上下文不匹配' }, { status: 502 });
  const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) > 0;
  const level = guard.ctx.billing.capabilities[capability];
  const report = data.report ? scopeCitationReport(data.report, level, pending) : null;
  const writer = ['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role);
  const detailed = hasCapabilityLevel(level, 'full');
  const canAct = view === 'suggestions' && data.enabled && writer && detailed && hasCapabilityLevel(guard.ctx.billing.capabilities.contentInsights, 'full') && !pending && !!report?.snapshot_current;
  return NextResponse.json({ ...data, view: view as WorkspaceView, report, context_sync_pending: pending,
    observations: detailed && ['insights', 'compare'].includes(view) ? data.observations : null,
    can_act: canAct, can_review: data.enabled && writer && detailed && view === 'insights' && !!report?.run_id && ['ready', 'partial', 'stale'].includes(report.status) }, { headers: { 'Cache-Control': 'no-store' } });
}
