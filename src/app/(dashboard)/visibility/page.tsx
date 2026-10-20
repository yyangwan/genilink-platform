"use client";

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CaptureProgress } from '@/components/visibility/capture-progress';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { CaptureControls } from '@/components/visibility/capture-controls';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId);
  const search = useSearchParams(), router = useRouter();
  const [createdAudit, setCreatedAudit] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryAudit = search.get('project') === projectId && /^[1-9][0-9]{0,17}$/.test(search.get('auditId') || '') ? search.get('auditId') : null;
  const auditId = createdAudit || queryAudit || dashboard.data?.latest_audit?.id || '';
  const currentData = dashboard.data;
  const selectedReport = currentData?.report?.audit_id === auditId ? currentData.report : null;
  const track = (id: string) => {
    setCreatedAudit(id); setSettingsOpen(false);
    router.replace(`/visibility?${new URLSearchParams({ project: projectId, auditId: id })}`, { scroll: false });
    dashboard.refetch();
  };
  const reportReady = !!selectedReport?.run_id && ['ready', 'partial', 'stale'].includes(selectedReport.status);
  return <div className="audit-workspace space-y-5">
    <PageHeader title="可见性分析" subtitle="掌握采集进度，查看各平台如何提及和引用你的品牌。" actions={<div className="visibility-header-actions"><Link href={`/audits?project=${encodeURIComponent(projectId)}`}>查看历史审计 ↗</Link><button type="button" className="dashboard-button dashboard-button--secondary" aria-expanded={settingsOpen || !auditId} aria-controls="visibility-capture-settings" onClick={() => setSettingsOpen(value => !value)}>采集设置</button>{auditId && <Link className="dashboard-button dashboard-button--primary" href={`/intelligence?${new URLSearchParams({ project: projectId, auditId, view: 'overview', ...(selectedReport?.run_id ? { runId: selectedReport.run_id } : {}) })}`}>{reportReady ? '查看本次审计洞察' : '查看任务详情'}</Link>}</div>} />
    {dashboard.loading && !dashboard.data ? <p role="status">正在读取当前项目的最新审计…</p> : dashboard.locked ? <p>当前未获得可见性报告权限，请检查订阅或项目访问权限。</p> : dashboard.error || !dashboard.data ? <p role="alert">概览暂不可用，请重试。尚不能判断当前平台表现。</p> : <>
      {auditId && <CaptureProgress projectId={projectId} auditId={auditId} onPublished={dashboard.refetch} report={selectedReport} />}
      {dashboard.data.can_capture ? <div id="visibility-capture-settings" className={settingsOpen || !auditId ? 'visibility-config visibility-config--open' : 'visibility-config'} hidden={!settingsOpen && !!auditId}><div className="visibility-config__head"><div><h2>采集设置</h2><p>选择提示词和独立轮次，系统采集支持平台的回答与可获取的来源正文。</p></div><Link href={`/settings/prompts?project=${encodeURIComponent(projectId)}`}>管理提示词 ↗</Link></div><CaptureControls key={projectId} activeAuditId={auditId} projectId={projectId} enabled={dashboard.data.enabled} onCreated={track} /></div> : <p className="dashboard-surface p-4 text-sm">采集入口暂不可用。请确认功能已启用、品牌配置已同步，且具有项目写入权限和完整分析权限。</p>}
      {auditId && currentData && <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>本次采集之后</h2><span className="citation-tag">{reportReady ? '分析修订可查看' : '等待分析修订'}</span></div>
      <p className="citation-muted">回答、来源正文和文本分析分别完成；采集结束不代表证据已完整。进入审计洞察后，可按平台、实体和来源逐项核对。</p>
      <div className="citation-capture-summary">
        <span>回答：{selectedReport?.coverage?.responses ?? '待核对'}</span>
        <span>正文：{selectedReport?.coverage ? `${selectedReport.coverage.captured_sources ?? '待核对'} / ${selectedReport.coverage.sources ?? '待核对'}` : '待核对'}</span>
        <span>分析：{selectedReport?.coverage ? `${selectedReport.coverage.analyzed_characters ?? 0} / ${selectedReport.coverage.total_characters ?? 0} 字` : '待核对'}</span>
      </div>
      <Link className="dashboard-button dashboard-button--primary" href={`/intelligence?${new URLSearchParams({ project: projectId, auditId, view: 'overview', ...(selectedReport?.run_id ? { runId: selectedReport.run_id } : {}) })}`}>进入审计洞察 →</Link>
    </section>}
    </>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
