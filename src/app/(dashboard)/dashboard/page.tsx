"use client";

import { Suspense } from 'react';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { ProjectWorkbench } from '@/components/dashboard/project-workbench';
import { PageHeader } from '@/components/ui/page-header';

function DashboardRoot() {
  const { currentProjectId, currentProject, projects, loading, openWizard } = useProject();

  if (loading) return <p role="status">正在准备工作空间…</p>;
  if (currentProjectId) {
    return <ProjectWorkbench key={currentProjectId} projectId={currentProjectId} projectName={currentProject?.name} />;
  }
  return <>
    <PageHeader title="工作台" />
    <ProjectSetupState hasProjects={projects.length > 0} featureName="工作台" onCreateProject={openWizard} />
  </>;
}

export default function DashboardPage() {
  return <Suspense fallback={<p role="status">正在加载工作台…</p>}><DashboardRoot /></Suspense>;
}
