"use client";

import React, { Suspense } from "react";
import { PenTool, FileText, Sparkles, ArrowRight, Construction } from "lucide-react";
import Link from "next/link";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import {
  DiagnosticChecklist,
  type DiagnosticItem,
} from "@/components/ui/diagnostic-checklist";
import type { ContentSummary } from "@/types";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

function ContentContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  const contentUrl = currentProjectId
    ? `/api/dashboard/content?project=${currentProjectId}`
    : null;
  const content = useSectionFetch<ContentSummary>(contentUrl);

  // No project selected state — show DiagnosticChecklist
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
        id: "product",
        label: "完善产品信息",
        status: currentProject?.productName ? "complete" : "incomplete",
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
            智創
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            AI驱动的内容创作与管理
          </p>
        </div>
        <DiagnosticChecklist items={diagnosticItems} title="准备工作" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sectionHeading)",
          }}
        >
          智創
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          AI驱动的内容创作与管理
          {currentProject && (
            <span style={{ color: "var(--text-muted)" }}> · {currentProject.name}</span>
          )}
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              总内容数
            </span>
          </div>
          {content.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {content.data?.totalContent ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <PenTool className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              已发布
            </span>
          </div>
          {content.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {content.data?.publishedCount ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              平均质量分
            </span>
          </div>
          {content.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {content.data?.qualityAvg ?? "--"}
            </span>
          )}
        </div>
      </div>

      {/* Coming soon state */}
      <div style={sectionCard}>
        <div className="flex flex-col items-center justify-center py-12">
          <Construction
            className="w-10 h-10 mb-3"
            style={{ color: "var(--color-primary)" }}
          />
          <h3
            className="text-base font-semibold mb-1"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            智創服务即将上线
          </h3>
          <p
            className="text-sm text-center max-w-md"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            AI驱动的内容创作功能正在开发中，敬请期待。你可以先在智見中分析品牌可见性，为内容策略提供数据支持。
          </p>
          <Link
            href="/visibility"
            className="flex items-center gap-1.5 mt-4 text-sm font-medium"
            style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
          >
            前往智見
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        </div>
      }
    >
      <ContentContent />
    </Suspense>
  );
}
