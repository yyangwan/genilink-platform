"use client";

import React, { Suspense } from "react";

import { ProductWebsiteAnalysisPanel } from "@/components/product-website/product-website-analysis-panel";
import { useProject } from "@/components/project/project-context";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { PageHeader } from "@/components/ui/page-header";

function WebsiteAnalysisContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  if (!loading && !currentProjectId) {
    const diagnosticItems: DiagnosticItem[] = [
      {
        id: "project",
        label: "创建项目",
        status: projects.length === 0 ? "incomplete" : "complete",
        actionLabel: "创建",
        onAction: () => openWizard(),
      },
      {
        id: "product-url",
        label: "完善产品网站",
        status: currentProject?.productUrl || currentProject?.url ? "complete" : "incomplete",
      },
    ];

    return (
      <div className="space-y-6">
        <PageHeader
          title="网站分析"
          subtitle="评估产品网站结构、语义覆盖、抓取质量和真实 AI 引用准备度。"
        />
        <section className="dashboard-surface dashboard-surface--padded">
          <DiagnosticChecklist items={diagnosticItems} title="准备工作" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="网站分析"
        subtitle={
          currentProject
            ? `针对产品网站进行独立可见性评估。 · ${currentProject.name}`
            : "针对产品网站进行独立可见性评估。"
        }
      />

      {currentProjectId && (
        <ProductWebsiteAnalysisPanel
          projectId={currentProjectId}
          productUrl={currentProject?.productUrl}
          projectUrl={currentProject?.url}
        />
      )}
    </div>
  );
}

export default function WebsiteAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <WebsiteAnalysisContent />
    </Suspense>
  );
}
