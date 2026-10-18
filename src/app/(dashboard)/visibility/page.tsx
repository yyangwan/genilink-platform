"use client";
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CaptureProgress } from '@/components/visibility/capture-progress';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { VisibilityOverview } from '@/components/visibility/visibility-overview';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { CaptureControls } from '@/components/visibility/capture-controls';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId);
  const search = useSearchParams(), router = useRouter();
  const [createdAudit, setCreatedAudit] = useState('');
  const auditId = createdAudit || (search.get('project') === projectId ? search.get('auditId') : '') || dashboard.data?.latest_audit?.id || '';
  const track = (id: string) => { setCreatedAudit(id); router.replace(`/visibility?${new URLSearchParams({ project: projectId, auditId: id })}`, { scroll: false }); dashboard.refetch(); };
  return <div className="audit-workspace space-y-5"><PageHeader title="可见性分析" subtitle="最新审计、全部实体与分平台证据" />
    <div className="audit-toolbar"><button className="dashboard-button dashboard-button--secondary" onClick={dashboard.refetch}>刷新概览</button><Link className="dashboard-button dashboard-button--secondary" href={`/settings/prompts?project=${encodeURIComponent(projectId)}`}>管理提示词</Link><Link className="dashboard-button dashboard-button--secondary" href={`/audits?project=${encodeURIComponent(projectId)}`}>审计记录</Link></div>
    {auditId && <CaptureProgress projectId={projectId} auditId={auditId} />}
    {dashboard.loading && !dashboard.data ? <p>正在读取当前项目的最新审计…</p> : dashboard.locked ? <p>当前未获得可见性报告权限，请检查订阅或项目访问权限。</p> : dashboard.error || !dashboard.data ? <p role="alert">概览暂不可用，请重试。尚不能判断当前平台表现。</p> : <>
      <VisibilityOverview data={dashboard.data} projectId={projectId} />
      {dashboard.data.can_capture ? <details className="audit-settings"><summary>采集设置<span>提示词与独立轮次 · 展开配置</span></summary><CaptureControls key={projectId} activeAuditId={auditId} projectId={projectId} enabled={dashboard.data.enabled} onCreated={track} /></details> : <p className="dashboard-surface p-4 text-sm">采集入口暂不可用。请确认功能已启用、品牌配置已同步，且具有项目写入权限和完整分析权限。</p>}
    </>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
