"use client";

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProjectId } from '@/components/project/use-project-id';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { CitationReportView } from '@/components/visibility/citation-report';
import type { CitationReport } from '@/types/citation-report';
import { ReportPdfButton } from '@/components/visibility/report-pdf-button';

function ReportContent({ auditId, projectId }: { auditId: string; projectId: string }) {
  const report = useSectionFetch<CitationReport>(`/api/integration/reports/${encodeURIComponent(auditId)}?${new URLSearchParams({ projectId })}`);
  const data = report.data?.audit_id === auditId && report.data.project_id === projectId ? report.data : null;
  return <div className="space-y-5"><PageHeader title={`报告指标与 PDF · 审计 #${auditId}`} subtitle="查看本修订的详细分母、排除原因和 PDF；日常分析请使用审计洞察。" />
    <div className="flex gap-5 text-sm"><Link href={`/audits?project=${encodeURIComponent(projectId)}`}>返回审计记录</Link><Link href={`/intelligence?${new URLSearchParams({ project: projectId, auditId, view: 'overview' })}`}>返回审计洞察</Link><button onClick={report.refetch}>刷新报告</button></div>
    {report.loading ? <p>正在读取最新分析快照…</p> : report.locked ? <p>当前没有报告访问权限。</p> : report.error || !data ? <p>报告暂不可用，请检查当前项目和审计后重试。</p> : <><ReportPdfButton key={data.run_id || auditId} projectId={projectId} auditId={auditId} runId={data.run_id} enabled={data.snapshot_current && ['ready', 'partial'].includes(data.status)} /><CitationReportView key={data.run_id || auditId} report={data} projectId={projectId} /></>}
  </div>;
}
function ReportPage() {
  const params = useParams();
  const { projectId } = useProjectId();
  return projectId ? <ReportContent key={`${projectId}-${params.id}`} auditId={String(params.id)} projectId={projectId} /> : <p>请先选择项目。</p>;
}
export default function AuditReportPage() {
  return <Suspense fallback={<p>正在加载审计报告…</p>}><ReportPage /></Suspense>;
}
