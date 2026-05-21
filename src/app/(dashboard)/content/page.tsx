"use client";

import React, { Suspense } from "react";
import { Sparkles, ArrowRight, Plus, FileText } from "lucide-react";
import Link from "next/link";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import {
  DiagnosticChecklist,
  type DiagnosticItem,
} from "@/components/ui/diagnostic-checklist";
import type { ContentSummary } from "@/types";
import type { ContentIntelligence } from "@/types/visibility";

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

const gapBadge = (level: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: "var(--radius-full)",
  background:
    level === "high"
      ? "color-mix(in srgb, var(--color-error) 12%, transparent)"
      : "color-mix(in srgb, var(--color-warning) 12%, transparent)",
  color:
    level === "high"
      ? "var(--color-error)"
      : "var(--color-warning)",
});

const metricStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "12px 0",
};

// ── Data Bridge Section ───────────────────────────────────────────────
function DataBridge({ projectId }: { projectId: string }) {
  const bridgeUrl = projectId
    ? `/api/integration/content-intelligence?projectId=${projectId}`
    : null;
  const bridge = useSectionFetch<ContentIntelligence>(bridgeUrl);

  if (bridge.loading) {
    return (
      <div style={card}>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-40 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <div className="h-4 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            <div className="h-7 w-20 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          </div>
        ))}
      </div>
    );
  }

  // No visibility data — cold start
  if (bridge.error || !bridge.data || !bridge.data.topics?.length) {
    return <ColdStartCard />;
  }

  const topics = bridge.data.topics.slice(0, 5);

  return (
    <div style={card}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          基于智見可见性分析的内容建议
        </p>
      </div>

      <div className="space-y-1">
        {topics.map((topic, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:opacity-90"
            style={{ transition: "background 0.15s" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span style={gapBadge(topic.sentiment < 0 ? "high" : "medium")}>
                {topic.sentiment < 0 ? "高优先" : "待覆盖"}
              </span>
              <span
                className="text-sm truncate"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
              >
                {topic.topic}
              </span>
            </div>
            <Link
              href={`/content/new?topic=${encodeURIComponent(topic.topic)}`}
              className="flex items-center gap-1 text-xs font-medium shrink-0 ml-3"
              style={{
                color: "var(--color-primary)",
                fontFamily: "var(--font-body)",
                textDecoration: "none",
                padding: "4px 10px",
                borderRadius: "var(--radius-md)",
                background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
              }}
            >
              <Sparkles size={12} />
              AI 生成
            </Link>
          </div>
        ))}
      </div>

      {bridge.data.topics.length > 5 && (
        <Link
          href="/content/list"
          className="flex items-center gap-1 mt-3 text-xs font-medium"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
        >
          查看全部 {bridge.data.topics.length} 个建议
          <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

// ── Cold Start Card ───────────────────────────────────────────────────
function ColdStartCard() {
  return (
    <div style={card}>
      <div className="text-center py-6">
        <p
          className="text-base font-semibold mb-2"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          还没有可见性数据
        </p>
        <p
          className="text-sm mb-4 max-w-sm mx-auto"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
        >
          运行第一次 AI 可见性审计，解锁基于数据的内容建议
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/visibility"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
            style={{
              background: "var(--color-primary)",
              color: "white",
              fontFamily: "var(--font-body)",
              textDecoration: "none",
            }}
          >
            前往智見
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/content/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              textDecoration: "none",
            }}
          >
            <Plus size={14} />
            从头开始写
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────────────
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

// ── Recent Content ────────────────────────────────────────────────────
function RecentContent({ content }: { content: { data: ContentSummary | null; loading: boolean } }) {
  const items = content.data?.recentContent ?? [];

  if (content.loading) {
    return (
      <div style={card}>
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
    <div style={card}>
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
              {new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Main Content ──────────────────────────────────────────────────────
function ContentContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  const contentUrl = currentProjectId
    ? `/api/dashboard/content?project=${currentProjectId}`
    : null;
  const content = useSectionFetch<ContentSummary>(contentUrl);

  // No project selected — show diagnostic checklist
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            AI驱动的内容创作与管理
            {currentProject && (
              <span style={{ color: "var(--text-muted)" }}> · {currentProject.name}</span>
            )}
          </p>
        </div>
        <Link
          href="/content/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "white",
            fontFamily: "var(--font-body)",
            textDecoration: "none",
          }}
        >
          <Plus size={14} />
          新建内容
        </Link>
      </div>

      {/* Data Bridge — owns first viewport */}
      {currentProjectId && <DataBridge projectId={currentProjectId} />}

      {/* KPI Strip — slim inline metrics */}
      <KPIStrip content={content} />

      {/* Recent Content */}
      <RecentContent content={content} />
    </div>
  );
}

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-16 rounded-lg animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <ContentContent />
    </Suspense>
  );
}
