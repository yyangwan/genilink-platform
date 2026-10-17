import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import type { MeasurementHistory } from '@/types/measurement-history';
import { scopeMeasurements } from '@/lib/visibility/measurement-scope';

export async function GET(req: NextRequest) {
  const cohortId = req.nextUrl.searchParams.get('cohortId');
  if (cohortId !== null && !/^[a-f0-9]{32}$/.test(cohortId)) return NextResponse.json({ error: '无效的复测方案' }, { status: 400 });
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const historyDays = guard.ctx.billing.capabilities.trendHistoryDays;
  if (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > 36500) return NextResponse.json({ error: '历史分析范围尚未开放' }, { status: 403 });
  const params = new URLSearchParams({ history_days: String(historyDays) });
  if (cohortId) params.set('cohort_id', cohortId);
  const upstream = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/measurement-history?${params}`, { errorMessage: '复测历史暂不可用' });
  if ('response' in upstream) return upstream.response;
  const data = upstream.data as MeasurementHistory;
  if (data?.schema !== 'citation-measurement-history-1' || data.project_id !== guard.ctx.projectId || cohortId && data.enabled && data.selected_cohort_id !== cohortId || data.results?.some(item => item.cohort_id !== data.selected_cohort_id || item.version !== 'paired-source-presence-2')) return NextResponse.json({ error: '复测历史上下文不匹配' }, { status: 502 });
  const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) > 0;
  // Stale results remain available as historical observations, never as a current change estimate.
  const results = scopeMeasurements(data.results, pending);
  return NextResponse.json({ ...data, results, history_days: historyDays, context_sync_pending: pending }, { headers: { 'Cache-Control': 'no-store' } });
}
