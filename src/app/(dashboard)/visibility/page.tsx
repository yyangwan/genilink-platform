"use client";

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CaptureProgress, type CaptureStatus } from '@/components/visibility/capture-progress';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { CaptureControls } from '@/components/visibility/capture-controls';
import { CaptureAnalysisScope } from '@/components/visibility/capture-analysis-scope';
import { intelligenceUrl } from '@/lib/visibility/analysis-scope';
import '@/components/visibility/visibility-collection.css';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId, 'collection');
  const search = useSearchParams(), router = useRouter();
  const [createdAudit, setCreatedAudit] = useState('');
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus | null>(null);
  const queryAudit = search.get('project') === projectId && /^[1-9][0-9]{0,17}$/.test(search.get('auditId') || '') ? search.get('auditId') : null;
  const auditId = createdAudit || queryAudit || dashboard.data?.latest_audit?.id || '';
  const currentData = dashboard.data;
  const selectedReport = currentData?.report?.audit_id === auditId ? currentData.report : null;
  const track = (id: string) => {
    setCreatedAudit(id);
    router.replace(`/visibility?${new URLSearchParams({ project: projectId, auditId: id })}`, { scroll: false });
    dashboard.refetch();
  };
  const reportReady = !!selectedReport?.run_id && ['ready', 'partial', 'stale'].includes(selectedReport.status);
  const insightUrl = intelligenceUrl(search.toString(), projectId, { auditId: auditId || null, view: 'overview', runId: selectedReport?.run_id || null });
  const evidenceUrl = intelligenceUrl(search.toString(), projectId, { auditId: auditId || null, view: 'evidence', runId: selectedReport?.run_id || null });
  return <div className="audit-workspace citation-workspace visibility-collection">
    <header className="citation-page-head"><div><span>VISIBILITY COLLECTION</span><h1>发起一次采集，跟踪每个阶段</h1><p>覆盖平台由服务端统一安排。客户只需确定问题范围并查看完整性。</p></div><div className="citation-page-actions"><Link className="dashboard-button dashboard-button--secondary" href={`/audits?project=${encodeURIComponent(projectId)}`}>查看历史审计 ↗</Link>{auditId && <Link className="dashboard-button dashboard-button--secondary" href={insightUrl}>{reportReady ? '查看本次审计洞察' : '查看任务详情'}</Link>}</div></header>
    {dashboard.loading && !dashboard.data ? <p role="status">正在读取当前项目的最新审计…</p> : dashboard.locked ? <p>当前未获得可见性报告权限，请检查订阅或项目访问权限。</p> : dashboard.error || !dashboard.data ? <p role="alert">概览暂不可用，请重试。尚不能判断当前平台表现。</p> : <>
      <CaptureAnalysisScope projectId={projectId} report={selectedReport} />
      {dashboard.data.can_capture ? <div id="visibility-capture-settings"><CaptureControls key={projectId} activeAuditId={auditId} projectId={projectId} enabled={dashboard.data.enabled} taskState={!auditId ? "idle" : captureStatus?.audit_id !== auditId ? "checking" : ["pending", "running"].includes(captureStatus.status) ? "running" : "idle"} onCreated={track} /><div className="visibility-collection__manage"><Link href={`/settings/prompts?project=${encodeURIComponent(projectId)}`}>管理提示词 ↗</Link></div></div> : <p className="dashboard-surface p-4 text-sm">采集入口暂不可用。请确认功能已启用、品牌配置已同步，且具有项目写入权限和完整分析权限。</p>}
      {auditId ? <CaptureProgress collection projectId={projectId} auditId={auditId} onPublished={dashboard.refetch} onStatus={setCaptureStatus} report={selectedReport} evidenceHref={evidenceUrl} /> : <section className="citation-panel citation-pad visibility-collection__idle" aria-label="当前采集任务"><h2>当前没有进行中的采集</h2><div className="visibility-collection__idle-stages">{['回答采集', '来源归档', '语义分析'].map(name => <div key={name}><span>{name}</span><strong>待发起</strong><progress aria-label={`${name}进度`} value={0} max={1} /></div>)}</div><p className="citation-muted">等待、执行、失败和部分完成有具体对象；来源受限不等于品牌表现为零。</p></section>}
      {currentData && <nav aria-label="本次采集之后" className="visibility-collection__next"><h2 className="sr-only">本次采集之后</h2><p>回答采集完成不等于报告已完成；结果与证据在审计洞察中查看。</p><Link className="dashboard-button dashboard-button--secondary" href={insightUrl}>进入审计洞察 →</Link></nav>}
    </>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
