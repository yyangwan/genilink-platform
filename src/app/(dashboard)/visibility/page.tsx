"use client";

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CaptureProgress } from '@/components/visibility/capture-progress';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { VisibilityResults } from '@/components/visibility/visibility-results';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { CaptureControls } from '@/components/visibility/capture-controls';
import type { AnalysisWorkspace } from '@/types/analysis-workspace';
import type { CitationDashboard } from '@/types/citation-dashboard';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId);
  const search = useSearchParams(), router = useRouter();
  const [createdAudit, setCreatedAudit] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryAudit = search.get('project') === projectId && /^[1-9][0-9]{0,17}$/.test(search.get('auditId') || '') ? search.get('auditId') : null;
  const auditId = createdAudit || queryAudit || dashboard.data?.latest_audit?.id || '';
  const selectedUrl = auditId && dashboard.data?.latest_audit?.id !== auditId
    ? `/api/integration/analysis-workspace?${new URLSearchParams({ projectId, auditId, view: 'insights' })}` : null;
  const selected = useSectionFetch<AnalysisWorkspace>(selectedUrl);
  const selectedData = selected.data?.selected_audit_id === auditId ? selected.data : null;
  const currentData: CitationDashboard | null = dashboard.data ? selectedUrl && selectedData ? {
    ...dashboard.data,
    latest_audit: { id: auditId, status: selectedData.audits.find(item => item.id === auditId)?.status || 'pending', stage: '',
      created_at: selectedData.audits.find(item => item.id === auditId)?.created_at || '', platforms: (selectedData.report?.platforms || []).map(item => item.platform) },
    report: selectedData.report,
    processing: selectedData.processing,
  } : dashboard.data : null;
  const refresh = useCallback(() => { dashboard.refetch(); if (selectedUrl) selected.refetch(); }, [dashboard.refetch, selected.refetch, selectedUrl]);
  useEffect(() => {
    if (!selectedUrl || !selectedData?.processing) return;
    const timer = setTimeout(selected.refetch, 10000);
    return () => clearTimeout(timer);
  }, [selectedUrl, selectedData?.processing, selected.refetch]);
  const track = (id: string) => {
    setCreatedAudit(id); setSettingsOpen(false);
    router.replace(`/visibility?${new URLSearchParams({ project: projectId, auditId: id })}`, { scroll: false });
    dashboard.refetch();
  };
  const taskQuery = new URLSearchParams({ project: projectId, ...(auditId ? { auditId } : {}) });
  const reportReady = currentData?.report?.audit_id === auditId && !!currentData.report.run_id && ['ready', 'partial', 'stale'].includes(currentData.report.status);
  return <div className="audit-workspace space-y-5">
    <PageHeader title="可见性分析" subtitle="掌握采集进度，查看各平台如何提及和引用你的品牌。" actions={<div className="visibility-header-actions"><Link href={`/audits?project=${encodeURIComponent(projectId)}`}>查看历史审计 ↗</Link><button type="button" className="dashboard-button dashboard-button--secondary" aria-expanded={settingsOpen || !auditId} aria-controls="visibility-capture-settings" onClick={() => setSettingsOpen(value => !value)}>采集设置</button>{auditId && <Link className="dashboard-button dashboard-button--primary" href={reportReady ? `/audits/${auditId}/report?${taskQuery}` : `/intelligence?${taskQuery}`}>{reportReady ? '查看本次报告' : '查看任务详情'}</Link>}</div>} />
    {dashboard.loading && !dashboard.data ? <p role="status">正在读取当前项目的最新审计…</p> : dashboard.locked ? <p>当前未获得可见性报告权限，请检查订阅或项目访问权限。</p> : dashboard.error || !dashboard.data ? <p role="alert">概览暂不可用，请重试。尚不能判断当前平台表现。</p> : <>
      {auditId && <CaptureProgress projectId={projectId} auditId={auditId} onPublished={refresh} report={currentData?.report} />}
      {selectedUrl && selected.error && <p role="alert" className="visibility-results__notice">本次审计的分析快照暂不可读，采集任务状态仍可回查。<button type="button" onClick={selected.refetch}>重试读取</button></p>}
      {dashboard.data.can_capture ? <div id="visibility-capture-settings" className={settingsOpen || !auditId ? 'visibility-config visibility-config--open' : 'visibility-config'} hidden={!settingsOpen && !!auditId}><div className="visibility-config__head"><div><h2>采集设置</h2><p>选择提示词和独立轮次，系统采集支持平台的回答与可获取的来源正文。</p></div><Link href={`/settings/prompts?project=${encodeURIComponent(projectId)}`}>管理提示词 ↗</Link></div><CaptureControls key={projectId} activeAuditId={auditId} projectId={projectId} enabled={dashboard.data.enabled} onCreated={track} /></div> : <p className="dashboard-surface p-4 text-sm">采集入口暂不可用。请确认功能已启用、品牌配置已同步，且具有项目写入权限和完整分析权限。</p>}
      {currentData && <VisibilityResults key={`${projectId}:${auditId}`} data={currentData} projectId={projectId} auditId={auditId} />}
    </>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
