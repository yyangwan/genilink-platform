import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import type { CitationReport } from '@/types/citation-report';
import { scopeCitationReport } from '@/lib/visibility/report-scope';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await resolveGuard(req, { capability: 'auditReport' });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[1-9][0-9]{0,17}$/.test(id)) return NextResponse.json({ error: '无效的审计编号' }, { status: 400 });
  const upstream = await fetchUpstream(guard.ctx, `/api/intelligence/audits/${id}/report`, { errorMessage: '审计报告暂不可用' });
  if ('response' in upstream) return upstream.response;
  const report = upstream.data as CitationReport;
  if (report?.schema !== 'citation-report-1' || report.audit_id !== id || report.project_id !== guard.ctx.projectId) return NextResponse.json({ error: '报告上下文不匹配' }, { status: 502 });
  if (report.measurements && (report.measurements.scope_run_id !== report.run_id || report.measurements.results.some(item => item.version !== 'paired-source-presence-2' || item.baseline_run_id !== report.run_id && item.followup_run_id !== report.run_id))) return NextResponse.json({ error: '复测与报告修订不匹配' }, { status: 502 });
  const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } });
  return NextResponse.json(scopeCitationReport(report, guard.ctx.billing.capabilities.auditReport, pending > 0), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  return NextResponse.json({ error: '报告直接读取最新分析快照，请在证据分析中明确发起分析' }, { status: 409 });
}
