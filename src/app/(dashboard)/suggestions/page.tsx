"use client";

import React, { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import {
  Lightbulb,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Loader2,
  Filter,
  RefreshCw,
} from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

interface Suggestion {
  id: string;
  text: string;
  category: string;
  platform: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "resolved" | "ignored";
}

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  high: { label: "高", bg: "var(--color-error)20", color: "var(--color-error)" },
  medium: { label: "中", bg: "var(--color-warning)20", color: "var(--color-warning)" },
  low: { label: "低", bg: "var(--color-success)20", color: "var(--color-success)" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  resolved: "已处理",
  ignored: "已忽略",
};

type StatusFilter = "all" | "pending" | "resolved" | "ignored";
type PriorityFilter = "all" | "high" | "medium" | "low";

function SuggestionsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const suggestionsUrl = currentProjectId
    ? `/api/integration/suggestions?projectId=${currentProjectId}`
    : null;

  const suggestions = useSectionFetch<Suggestion[]>(suggestionsUrl);

  const refetch = suggestions.refetch;

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/integration/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (res.ok) refetch();
    } catch { /* silent */ }
    finally { setGenerating(false); }
  }, [currentProjectId, generating, refetch]);

  const handleResolve = useCallback(
    async (id: string) => {
      if (!currentProjectId) return;
      setResolvingIds((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/integration/suggestions/${id}?projectId=${currentProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        });
        if (res.ok) refetch();
      } catch {
        // silent
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [currentProjectId, refetch],
  );

  const allData = suggestions.data ?? [];

  // Apply filters
  const filtered = allData.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (priorityFilter !== "all" && s.priority !== priorityFilter) return false;
    return true;
  });

  const filterButtonStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--color-primary)20" : "var(--bg-elevated)",
    color: active ? "var(--color-primary)" : "var(--text-secondary)",
    border: `1px solid ${active ? "var(--color-primary)" : "var(--border)"}`,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: 13,
    fontWeight: 500,
    transition: "all 0.15s",
  });

  // No project selected — show diagnostic checklist
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="优化建议" subtitle="AI 生成的可见性优化建议" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="优化建议" subtitle="AI 生成的可见性优化建议" />
        {currentProjectId && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
            style={{
              background: "var(--color-primary)",
              color: "#0b0d14",
              border: "none",
              cursor: generating ? "wait" : "pointer",
              fontFamily: "var(--font-body)",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {generating ? "生成中..." : "生成建议"}
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            状态
          </span>
        </div>
        {(["all", "pending", "resolved", "ignored"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={filterButtonStyle(statusFilter === s)}
          >
            {s === "all" ? "全部" : STATUS_LABELS[s]}
          </button>
        ))}
        <div style={{ width: "1px", height: "20px", background: "var(--border)" }} />
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            优先级
          </span>
        </div>
        {(["all", "high", "medium", "low"] as PriorityFilter[]).map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            style={filterButtonStyle(priorityFilter === p)}
          >
            {p === "all" ? "全部" : PRIORITY_CONFIG[p].label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {suggestions.loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-skeleton-pulse"
              style={{ background: "var(--bg-hover)" }}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {suggestions.error && !suggestions.loading && (
        <div style={sectionCard}>
          <ErrorState onRetry={suggestions.refetch} />
        </div>
      )}

      {/* Suggestion cards */}
      {!suggestions.loading && !suggestions.error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const prio = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
            return (
              <div key={s.id} style={sectionCard} className="flex flex-col">
                {/* Top: priority + status */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: prio.bg, color: prio.color }}
                  >
                    {prio.label}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: s.status === "resolved" ? "var(--color-success)" : s.status === "ignored" ? "var(--text-muted)" : "var(--text-secondary)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                </div>

                {/* Text */}
                <p
                  className="text-sm flex-1 mb-4"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}
                >
                  {s.text}
                </p>

                {/* Meta */}
                <div className="flex items-center gap-3 mb-4">
                  {s.category && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                    >
                      {s.category}
                    </span>
                  )}
                  {s.platform && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                    >
                      {s.platform}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  {s.status === "pending" && (
                    <button
                      onClick={() => handleResolve(s.id)}
                      disabled={resolvingIds.has(s.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: "var(--color-success)20",
                        color: "var(--color-success)",
                        border: "none",
                        cursor: resolvingIds.has(s.id) ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-body)",
                        opacity: resolvingIds.has(s.id) ? 0.6 : 1,
                      }}
                    >
                      {resolvingIds.has(s.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      标记已处理
                    </button>
                  )}
                  <button
                    disabled
                    title="智創服务即将上线"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      background: "var(--bg-hover)",
                      color: "var(--text-muted)",
                      border: "none",
                      cursor: "not-allowed",
                      fontFamily: "var(--font-body)",
                      opacity: 0.5,
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    生成内容
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!suggestions.loading && !suggestions.error && filtered.length === 0 && (
        <div style={sectionCard}>
          <EmptyState
            icon={Lightbulb}
            title="暂无优化建议"
            description={
              allData.length === 0
                ? "运行 AI 分析以获取个性化优化建议"
                : "当前筛选条件下没有匹配的建议"
            }
            actionLabel={allData.length === 0 ? "运行分析以获取 AI 建议" : undefined}
            actionHref={allData.length === 0 ? "/visibility" : undefined}
          />
        </div>
      )}
    </div>
  );
}

export default function SuggestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-xl animate-skeleton-pulse"
                style={{ background: "var(--bg-hover)" }}
              />
            ))}
          </div>
        </div>
      }
    >
      <SuggestionsContent />
    </Suspense>
  );
}
