"use client";

import React from "react";
import { FolderOpen, FolderPlus } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

interface ProjectSetupStateProps {
  hasProjects: boolean;
  featureName: string;
  onCreateProject: () => void;
  createDescription?: string;
  selectionDescription?: string;
}

export function ProjectSetupState({
  hasProjects,
  featureName,
  onCreateProject,
  createDescription,
  selectionDescription,
}: ProjectSetupStateProps) {
  return (
    <div className="dashboard-surface">
      <EmptyState
        icon={hasProjects ? FolderOpen : FolderPlus}
        title={hasProjects ? "先选择一个项目" : "先创建一个项目"}
        description={
          hasProjects
            ? selectionDescription ?? `${featureName}按项目管理，请先从顶部项目菜单选择要查看的项目。`
            : createDescription ?? `项目用于归集品牌、审计和内容数据。创建后即可开始使用${featureName}。`
        }
        actionLabel={hasProjects ? "查看项目" : "创建第一个项目"}
        actionHref={hasProjects ? "/projects" : undefined}
        onAction={hasProjects ? undefined : onCreateProject}
      />
    </div>
  );
}
