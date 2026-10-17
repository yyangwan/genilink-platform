"use client";

import React, { Suspense } from "react";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import {
  DiagnosticChecklist,
  type DiagnosticItem,
} from "@/components/ui/diagnostic-checklist";
import type { ContentSummary } from "@/types";
import { formatDateInTimeZone } from "@/lib/time";
import { SubscriptionRequiredState } from "@/components/billing/subscription-required-state";
import { ContentEvidenceBridge } from "@/components/visibility/content-evidence-bridge";
import { useProjectId } from "@/components/project/use-project-id";

const metricStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "12px 0",
};

// KPI Strip
function KPIStrip({ content }: { content: { data: ContentSummary | null; loading: boolean } }) {
  const metrics = [
    { label: "总内容", value: content.data?.totalContent },
    { label: "已发布", value: content.data?.publishedCount },
    {
      label: "质量分",
      value: content.data?.qualityAvg != null ? content.data.qualityAvg.toFixed(1) : null,
    },
  ];

  return (
      <div
      className="flex items-center divide-x divide-[var(--border)]"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
    >
      {metrics.map((m) => (
        <div key={m.label} style={{ ...metricStyle, flex: 1, textAlign: "center" }}>
          {content.loading ? (
            <div className="h-6 w-10 mx-auto rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span
              className="text-lg font-bold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            >
              {m.value ?? "—"}
            </span>
          )}
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
          >
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Recent Content
function RecentContent({ content }: { content: { data: ContentSummary | null; loading: boolean } }) {
  const items = content.data?.recentContent ?? [];

  if (content.loading) {
    return (
      <div className="dashboard-surface dashboard-surface--padded">
        <div className="h-4 w-24 mb-4 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 mb-2 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="dashboard-surface dashboard-surface--padded">
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
        >
          最近内容
        </span>
        <Link
          href="/content/list"
          className="text-xs font-medium"
          style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
        >
          查看全部
        </Link>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/content/${item.id}/edit`}
            className="flex items-center gap-3 py-2 px-2 rounded-md"
            style={{ textDecoration: "none", transition: "background 0.15s" }}
          >
            <FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span
              className="text-sm truncate flex-1"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
            >
              {item.title || "无标题"}
            </span>
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              {formatDateInTimeZone(item.createdAt, { includeTime: false })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Main Content
function ProjectContent({ projectId: currentProjectId }: { projectId: string }) {
  const { currentProject } = useProject();
  const content = useSectionFetch<ContentSummary>(`/api/dashboard/content?project=${encodeURIComponent(currentProjectId)}`);

  if (content.locked) {
    return (
      <div className="space-y-5">
        <PageHeader title="智创" subtitle="AI 驱动的内容创作与管理" />
        <section className="dashboard-surface dashboard-surface--padded">
          <SubscriptionRequiredState feature="智创内容管理" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="智创"
        subtitle={`AI 驱动的内容创作与管理${currentProject?.id === currentProjectId ? ` · ${currentProject.name}` : ""}`}
        actions={
          <Link href="/content/new" className="dashboard-button dashboard-button--primary">
            <Plus size={14} />
            新建内容
          </Link>
        }
      />

      {/* Data Bridge */}
      {currentProjectId && <ContentEvidenceBridge key={currentProjectId} projectId={currentProjectId} />}

      {/* KPI Strip */}
      <KPIStrip content={content} />

      {/* Recent Content */}
      <RecentContent content={content} />
    </div>
  );
}

function ContentContent() {
  const { currentProject, projects, openWizard } = useProject();
  const { projectId, loading } = useProjectId();
  if (loading) return <p>正在加载项目…</p>;
  if (!projectId) {
    const items: DiagnosticItem[] = [
      { id: 'project', label: '创建项目', status: projects.length === 0 ? 'incomplete' : 'complete', actionLabel: '创建', onAction: () => openWizard() },
      { id: 'product', label: '完善产品信息', status: currentProject?.productName ? 'complete' : 'incomplete' },
    ];
    return <div className="space-y-6"><PageHeader title="智创" subtitle="AI 驱动的内容创作与管理" /><section className="dashboard-surface dashboard-surface--padded"><DiagnosticChecklist items={items} title="准备工作" /></section></div>;
  }
  return <ProjectContent key={projectId} projectId={projectId} />;
}

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="dashboard-surface dashboard-surface--padded h-10 w-48 animate-skeleton-pulse" />
          <div className="dashboard-surface dashboard-surface--padded h-48 animate-skeleton-pulse" />
          <div className="dashboard-surface dashboard-surface--padded h-16 animate-skeleton-pulse" />
        </div>
      }
    >
      <ContentContent />
    </Suspense>
  );
}


