"use client";

import React, { Suspense } from "react";
import { Globe2 } from "lucide-react";

import { ProductWebsiteAnalysisPanel } from "@/components/product-website/product-website-analysis-panel";
import { useProject } from "@/components/project/project-context";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";

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
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            网站分析
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            评估产品网站结构、语义覆盖、抓取质量和真实 AI 引用准备度。
          </p>
        </div>
        <DiagnosticChecklist items={diagnosticItems} title="准备工作" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" style={{ color: "var(--color-primary)" }} />
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-sectionHeading)",
              }}
            >
              网站分析
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            针对产品网站进行独立可见性评估
            {currentProject && <span style={{ color: "var(--text-muted)" }}> · {currentProject.name}</span>}
          </p>
        </div>
      </div>

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
