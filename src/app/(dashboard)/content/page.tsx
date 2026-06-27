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
import { formatDateInTimeZone } from "@/lib/time";

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

// 鈹€鈹€ Data Bridge Section 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function DataBridge({ projectId }: { projectId: string }) {
  const bridgeUrl = projectId ? `/api/dashboard/visibility?project=${projectId}` : null;
  const bridge = useSectionFetch<{ suggestions: { priority: string; text: string }[] }>(bridgeUrl);

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

  if (bridge.error || !bridge.data || !bridge.data.suggestions?.length) {
    return <ColdStartCard />;
  }

  const suggestions = bridge.data.suggestions.slice(0, 5);

  const priorityBadge = (priority: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    background:
      priority === "high"
        ? "color-mix(in srgb, var(--color-error) 12%, transparent)"
        : priority === "low"
          ? "color-mix(in srgb, var(--text-muted) 12%, transparent)"
          : "color-mix(in srgb, var(--color-warning) 12%, transparent)",
    color:
      priority === "high"
        ? "var(--color-error)"
        : priority === "low"
          ? "var(--text-muted)"
          : "var(--color-warning)",
  });

  return (
    <div style={card}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          基于智见可见性分析的内容建议
        </p>
      </div>

      <div className="space-y-1">
        {suggestions.map((suggestion, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg hover:opacity-90"
            style={{ transition: "background 0.15s" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span style={priorityBadge(suggestion.priority)}>
                {suggestion.priority === "high" ? "高优先" : suggestion.priority === "low" ? "低优先" : "待覆盖"}
              </span>
              <span
                className="text-sm truncate"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
              >
                {suggestion.text}
              </span>
            </div>
            <Link
              href={`/content/new?topic=${encodeURIComponent(suggestion.text)}`}
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

      {bridge.data.suggestions.length > 5 && (
        <Link
          href="/content/list"
          className="flex items-center gap-1 mt-3 text-xs font-medium"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
        >
          查看全部 {bridge.data.suggestions.length} 条建议
          <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

function ColdStartCard() {
  return (
    <div style={card}>
      <div className="text-center py-6">
        <p
          className="text-base font-semibold mb-2"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          杩樻病鏈夊彲瑙佹€ф暟鎹?        </p>
        <p
          className="text-sm mb-4 max-w-sm mx-auto"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
        >
          杩愯绗竴娆?AI 鍙鎬у璁★紝瑙ｉ攣鍩轰簬鏁版嵁鐨勫唴瀹瑰缓璁?        </p>
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
            鍓嶅線鏅鸿
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
            浠庡ご寮€濮嬪啓
          </Link>
        </div>
      </div>
    </div>
  );
}

// 鈹€鈹€ KPI Strip 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function KPIStrip({ content }: { content: { data: ContentSummary | null; loading: boolean } }) {
  const metrics = [
    { label: "Total", value: content.data?.totalContent },
    { label: "Published", value: content.data?.publishedCount },
    {
      label: "Quality",
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

// 鈹€鈹€ Recent Content 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
          Recent content
        </span>
        <Link
          href="/content/list"
          className="text-xs font-medium"
          style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
        >
          鏌ョ湅鍏ㄩ儴
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
              {item.title || "Untitled"}
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

// 鈹€鈹€ Main Content 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function ContentContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  const contentUrl = currentProjectId
    ? `/api/dashboard/content?project=${currentProjectId}`
    : null;
  const content = useSectionFetch<ContentSummary>(contentUrl);

  // No project selected 鈥?show diagnostic checklist
  if (!loading && !currentProjectId) {
    const diagnosticItems: DiagnosticItem[] = [
      {
        id: "project",
        label: "鍒涘缓椤圭洰",
        status: projects.length === 0 ? "incomplete" : "complete",
        actionLabel: "鍒涘缓",
        onAction: () => openWizard(),
      },
      {
        id: "product",
        label: "瀹屽杽浜у搧淇℃伅",
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
            鏅哄壍
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            AI椹卞姩鐨勫唴瀹瑰垱浣滀笌绠＄悊
          </p>
        </div>
        <DiagnosticChecklist items={diagnosticItems} title="鍑嗗宸ヤ綔" />
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
            鏅哄壍
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            AI椹卞姩鐨勫唴瀹瑰垱浣滀笌绠＄悊
            {currentProject && (
              <span style={{ color: "var(--text-muted)" }}> 路 {currentProject.name}</span>
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
          鏂板缓鍐呭
        </Link>
      </div>

      {/* Data Bridge 鈥?owns first viewport */}
      {currentProjectId && <DataBridge projectId={currentProjectId} />}

      {/* KPI Strip 鈥?slim inline metrics */}
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


