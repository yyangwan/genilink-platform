"use client";
import { Suspense } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { DashboardCard, ErrorState, EmptyState, LoadingSkeleton } from '@/components/dashboard/widgets';
import { VisibilityOverview } from '@/components/visibility/visibility-overview';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import type { ContentSummary } from '@/types';

function ProjectDashboard({ projectId }: { projectId: string }) {
  const visibility = useVisibilityDashboard(projectId);
  const content = useSectionFetch<ContentSummary>(`/api/dashboard/content?${new URLSearchParams({ project: projectId })}`);
  const query = new URLSearchParams({ project: projectId }).toString();
  return <div className="space-y-6"><PageHeader title="工作台" subtitle="当前项目的最新审计与内容进展" />
    <div className="flex flex-wrap gap-4 text-sm"><Link href={`/visibility?${query}`}>采集与可见性分析</Link><Link href={`/intelligence?${query}`}>证据核对与固定样本复测</Link><button onClick={visibility.refetch}>刷新审计概览</button></div>
    {visibility.loading && !visibility.data ? <LoadingSkeleton rows={5} /> : visibility.locked ? <EmptyState message="当前没有报告访问权限，请检查订阅或项目权限。" actionLabel="查看订阅" actionHref="/settings/billing" /> : visibility.error || !visibility.data ? <ErrorState onRetry={visibility.refetch} /> : <VisibilityOverview data={visibility.data} projectId={projectId} compact />}
    <DashboardCard title="内容发布进展">
      {content.loading ? <LoadingSkeleton rows={3} /> : content.locked ? <EmptyState message="内容服务需要相应订阅。" actionLabel="查看订阅" actionHref="/settings/billing" /> : content.error ? <ErrorState onRetry={content.refetch} /> : !content.data?._meta?.serviceAvailable ? <p>内容服务暂不可用，发布数量未知。</p> : <>
        <div className="mb-4 grid grid-cols-2 gap-4"><p>已发布内容 <strong>{content.data.publishedCount}</strong></p><p>内容总量 <strong>{content.data.totalContent}</strong></p></div>
        {content.data.recentContent.length ? <ul className="space-y-2">{content.data.recentContent.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-3 text-sm"><span>{item.title}</span><span>{item.platform}</span></li>)}</ul> : <p>暂无已发布内容。</p>}
      </>}
      <div className="mt-4 flex gap-4 text-sm"><Link href={`/content?${query}`}>进入内容工作台</Link><Link href={`/website-analysis?${query}`}>网站分析</Link></div>
    </DashboardCard>
  </div>;
}
function DashboardRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在准备工作空间…</p>;
  return currentProjectId ? <ProjectDashboard key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="工作台" /><ProjectSetupState hasProjects={projects.length > 0} featureName="工作台" onCreateProject={openWizard} /></>;
}
export default function DashboardPage() { return <Suspense fallback={<p>正在加载工作台…</p>}><DashboardRoot /></Suspense>; }
