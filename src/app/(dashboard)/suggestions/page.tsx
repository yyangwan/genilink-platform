"use client";

import React, { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import {
  Lightbulb,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Loader2,
  Filter,
  RefreshCw,
  Target,
  Calendar,
  Users,
  FileText,
  TrendingUp,
  Tag,
} from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { sectionCard } from "@/components/charts/shared";

interface Suggestion {
  id: string;
  report_id?: number;
  audit_id?: number;
  text: string;
  description?: string;
  category: string;
  platform: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "resolved" | "ignored";
  evidence_summary?: string;
  audit_findings?: string[];
  success_metric?: string;
  audit_evidence?: Array<string | { platform?: string; prompt?: string; finding?: string }>;
  acceptance_criteria?: string[];
  measurement_plan?: string;
  // Action plan detail fields
  evidence_sources?: string[];
  evidence_channels?: string[];
  action_sources?: string[];
  action_channels?: string[];
  action_type?: string;
  type_tags?: string[];
  keywords?: string[];
  content_outline?: string;
  weekly_tasks?: { week: string; tasks: string[] }[];
  competitor_reference?: string;
  expected_result?: string;
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

/** Check if a suggestion has any action plan detail data */
function hasActionPlan(s: Suggestion): boolean {
  return !!(
    (s.evidence_sources && s.evidence_sources.length > 0) ||
    (s.evidence_channels && s.evidence_channels.length > 0) ||
    (s.action_sources && s.action_sources.length > 0) ||
    (s.action_channels && s.action_channels.length > 0) ||
    s.action_type ||
    (s.type_tags && s.type_tags.length > 0) ||
    (s.keywords && s.keywords.length > 0) ||
    s.evidence_summary ||
    (s.audit_findings && s.audit_findings.length > 0) ||
    s.success_metric ||
    (s.audit_evidence && s.audit_evidence.length > 0) ||
    (s.acceptance_criteria && s.acceptance_criteria.length > 0) ||
    s.measurement_plan ||
    s.content_outline ||
    (s.weekly_tasks && s.weekly_tasks.length > 0) ||
    s.competitor_reference ||
    s.expected_result
  );
}

/** Expandable action plan section */
function ActionPlanDetail({ suggestion }: { suggestion: Suggestion }) {
  const hasDetail = hasActionPlan(suggestion);

  if (!hasDetail) {
    return (
      <div style={{ padding: "12px 0 0", color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
        暂无详细行动计划
      </div>
    );
  }

  const sectionGap: React.CSSProperties = { marginBottom: 16 };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };
  const textBlock: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-hover)",
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: "var(--font-body)",
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
  };

  return (
    <div style={{ padding: "12px 0 0" }}>
      {(suggestion.audit_id || suggestion.report_id) && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            关联审计
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestion.audit_id && (
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-body)", background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                审计 #{suggestion.audit_id}
              </span>
            )}
            {suggestion.report_id && (
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-body)", background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                报告 #{suggestion.report_id}
              </span>
            )}
          </div>
        </div>
      )}

      {suggestion.evidence_summary && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            审计依据
          </div>
          <div style={textBlock}>{suggestion.evidence_summary}</div>
        </div>
      )}

      {suggestion.audit_findings && suggestion.audit_findings.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Target style={{ width: 14, height: 14 }} />
            对应发现
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
            {suggestion.audit_findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.audit_evidence && suggestion.audit_evidence.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            证据样本
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggestion.audit_evidence.slice(0, 3).map((item, i) => (
              <div key={i} style={textBlock}>
                {typeof item === "string" ? item : (
                  <>
                    {item.platform && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{item.platform}</div>}
                    {item.prompt && <div>{item.prompt}</div>}
                    {item.finding && <div>{item.finding}</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestion.evidence_channels && suggestion.evidence_channels.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Target style={{ width: 14, height: 14 }} />
            证据来源渠道
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestion.evidence_channels.map((ch, i) => (
              <span
                key={i}
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  background: "var(--color-primary)15",
                  color: "var(--color-primary)",
                  border: "1px solid var(--color-primary)30",
                }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestion.evidence_sources && suggestion.evidence_sources.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            证据引用来源网站
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestion.evidence_sources.map((source, i) => (
              <span
                key={i}
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  background: "var(--bg-hover)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestion.action_type && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Sparkles style={{ width: 14, height: 14 }} />
            执行动作类型
          </div>
          <div style={textBlock}>{suggestion.action_type}</div>
        </div>
      )}

      {suggestion.action_channels && suggestion.action_channels.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Target style={{ width: 14, height: 14 }} />
            执行渠道
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestion.action_channels.map((ch, i) => (
              <span
                key={i}
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  background: "var(--color-primary)15",
                  color: "var(--color-primary)",
                  border: "1px solid var(--color-primary)30",
                }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestion.action_sources && suggestion.action_sources.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            行动落点网站
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestion.action_sources.map((source, i) => (
              <span
                key={i}
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  background: "var(--color-primary)10",
                  color: "var(--color-primary)",
                  border: "1px solid var(--color-primary)30",
                }}
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", ...sectionGap }}>
        {suggestion.type_tags && suggestion.type_tags.length > 0 && (
          <div>
            <div style={sectionTitle}>
              <Tag style={{ width: 14, height: 14 }} />
              类型标签
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestion.type_tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {suggestion.keywords && suggestion.keywords.length > 0 && (
          <div>
            <div style={sectionTitle}>
              <Tag style={{ width: 14, height: 14 }} />
              关键词
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestion.keywords.map((kw, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    background: "var(--color-warning)15",
                    color: "var(--color-warning)",
                    border: "1px solid var(--color-warning)30",
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {suggestion.content_outline && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <FileText style={{ width: 14, height: 14 }} />
            内容大纲
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-hover)",
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: "var(--font-body)",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {suggestion.content_outline}
          </div>
        </div>
      )}

      {suggestion.weekly_tasks && suggestion.weekly_tasks.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Calendar style={{ width: 14, height: 14 }} />
            周任务时间表
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggestion.weekly_tasks.map((wt, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--bg-hover)",
                  borderLeft: "3px solid var(--color-primary)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-primary)",
                    fontFamily: "var(--font-body)",
                    marginBottom: 4,
                  }}
                >
                  {wt.week}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
                  {wt.tasks.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestion.competitor_reference && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <Users style={{ width: 14, height: 14 }} />
            竞品参考
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-hover)",
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: "var(--font-body)",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {suggestion.competitor_reference}
          </div>
        </div>
      )}

      {suggestion.success_metric && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <TrendingUp style={{ width: 14, height: 14 }} />
            成功指标
          </div>
          <div style={textBlock}>{suggestion.success_metric}</div>
        </div>
      )}

      {suggestion.acceptance_criteria && suggestion.acceptance_criteria.length > 0 && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <CheckCircle2 style={{ width: 14, height: 14 }} />
            验收标准
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
            {suggestion.acceptance_criteria.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.measurement_plan && (
        <div style={sectionGap}>
          <div style={sectionTitle}>
            <TrendingUp style={{ width: 14, height: 14 }} />
            衡量方式
          </div>
          <div style={textBlock}>{suggestion.measurement_plan}</div>
        </div>
      )}

      {suggestion.expected_result && (
        <div>
          <div style={sectionTitle}>
            <TrendingUp style={{ width: 14, height: 14 }} />
            预期结果
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--color-success)10",
              border: "1px solid var(--color-success)25",
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: "var(--font-body)",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {suggestion.expected_result}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const suggestionsUrl = currentProjectId
    ? `/api/integration/suggestions?projectId=${currentProjectId}`
    : null;

  const suggestions = useSectionFetch<Suggestion[]>(suggestionsUrl);

  const refetch = suggestions.refetch;
  const locked = suggestions.locked;

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId || generating || locked) return;
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
  }, [currentProjectId, generating, locked, refetch]);

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

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
            disabled={generating || locked}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
            style={{
              background: "var(--color-primary)",
              color: "#0b0d14",
              border: "none",
              cursor: generating || locked ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)",
              opacity: generating || locked ? 0.6 : 1,
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

      {suggestions.locked && !suggestions.loading && (
        <div style={sectionCard}>
          <EmptyState
            icon={Lightbulb}
            title="需要升级后使用"
            description="优化建议功能需要订阅智见专业版"
          />
        </div>
      )}

      {/* Suggestion cards */}
      {!suggestions.loading && !suggestions.error && !suggestions.locked && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((s) => {
            const prio = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
            const expanded = expandedIds.has(s.id);
            const showExpand = hasActionPlan(s);
            return (
              <div
                key={s.id}
                style={{
                  ...sectionCard,
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                {/* Card header — always visible, clickable to expand */}
                <button
                  onClick={() => toggleExpand(s.id)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: showExpand ? "pointer" : "default",
                    textAlign: "left",
                    padding: "20px 24px",
                    fontFamily: "var(--font-body)",
                    color: "inherit",
                  }}
                >
                  {/* Top: priority + status */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: prio.bg, color: prio.color }}
                      >
                        {prio.label}
                      </span>
                      {showExpand && (
                        <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                          {expanded ? (
                            <ChevronDown style={{ width: 16, height: 16 }} />
                          ) : (
                            <ChevronRight style={{ width: 16, height: 16 }} />
                          )}
                        </span>
                      )}
                    </div>
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
                    className="text-sm mb-3"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}
                  >
                    {s.text}
                  </p>

                  {/* Meta */}
                  <div className="flex items-center gap-3">
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
                    {s.audit_id && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                      >
                        审计 #{s.audit_id}
                      </span>
                    )}
                    {showExpand && !expanded && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)" }}
                      >
                        点击查看行动计划
                      </span>
                    )}
                  </div>
                </button>

                {/* Expandable action plan */}
                {expanded && (
                  <div
                    style={{
                      padding: "0 24px 20px",
                      borderTop: "1px solid var(--border)",
                      marginTop: 0,
                    }}
                  >
                    <ActionPlanDetail suggestion={s} />

                    {/* Actions inside expanded view */}
                    <div className="flex items-center gap-2 pt-4" style={{ borderTop: "1px solid var(--border)", marginTop: 16 }}>
                      {s.status === "pending" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResolve(s.id); }}
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!suggestions.loading && !suggestions.error && !suggestions.locked && filtered.length === 0 && (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
