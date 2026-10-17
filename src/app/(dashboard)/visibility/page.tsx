"use client";
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { VisibilityOverview } from '@/components/visibility/visibility-overview';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { CaptureControls } from '@/components/visibility/capture-controls';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId);
  const [createdAudit, setCreatedAudit] = useState('');
  return <div className="space-y-5"><PageHeader title="可见性分析" subtitle="最新审计、全部实体与分平台证据" />
    <div className="flex flex-wrap gap-4 text-sm"><button onClick={dashboard.refetch}>刷新概览</button><Link href={`/settings/prompts?project=${encodeURIComponent(projectId)}`}>管理提示词</Link><Link href={`/audits?project=${encodeURIComponent(projectId)}`}>审计记录</Link></div>
    {dashboard.loading && !dashboard.data ? <p>正在读取当前项目的最新审计…</p> : dashboard.locked ? <p>当前未获得可见性报告权限，请检查订阅或项目访问权限。</p> : dashboard.error || !dashboard.data ? <p role="alert">概览暂不可用，请重试。尚不能判断当前平台表现。</p> : <>
      <VisibilityOverview data={dashboard.data} projectId={projectId} />
      {dashboard.data.can_capture ? <CaptureControls key={projectId} projectId={projectId} enabled={dashboard.data.enabled} onCreated={id => { setCreatedAudit(id); dashboard.refetch(); }} /> : <p className="dashboard-surface p-4 text-sm">采集入口暂不可用。请确认功能已启用、品牌配置已同步，且具有项目写入权限和完整分析权限。</p>}
    </>}
    {createdAudit && <p role="status">已创建采集任务 #{createdAudit}，可以刷新概览或进入证据分析查看进度。</p>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
