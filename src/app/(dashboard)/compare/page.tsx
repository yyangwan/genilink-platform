"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const CompareRadarChart = dynamic(
  () => import("@/components/charts/CompareRadarChart"),
  { ssr: false },
);
const ComparePivotTable = dynamic(
  () => import("@/components/charts/ComparePivotTable"),
  { ssr: false },
);
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditListItem, AuditComparison, ReportInsight } from "@/types/visibility";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

function CompareContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [auditA, setAuditA] = useState<string>("");
  const [auditB, setAuditB] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState(false);
  const [result, setResult] = useState<AuditComparison | null>(null);

  // Fetch audits for the compare dropdown
  useEffect(() => {
    if (!currentProjectId) return;
    fetch(`/api/integration/audits?projectId=${currentProjectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.audits) {
          setAudits(data.audits);
        } else if (Array.isArray(data)) {
          setAudits(data);
        }
      })
      .catch(() => {});
  }, [currentProjectId]);

  const handleCompare = useCallback(async () => {
    if (!auditA || !auditB || !currentProjectId) return;

    setComparing(true);
    setCompareError(false);
    setResult(null);

    try {
      const res = await fetch("/api/integration/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audit_a_id: Number(auditA),
          audit_b_id: Number(auditB),
          project_id: currentProjectId,
        }),
      });

      if (!res.ok) {
        setCompareError(true);
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      setCompareError(true);
    } finally {
      setComparing(false);
    }
  }, [auditA, auditB, currentProjectId]);

  const selectStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
    minWidth: 200,
  };

  const completedAudits = audits.filter(
    (a) => a.status === "completed" && a.overall_score != null
  );

  const renderSelect = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={selectStyle}
    >
      <option value="">{placeholder}</option>
      {completedAudits.map((a) => (
        <option key={a.id} value={String(a.id)}>
          #{a.id} — {a.overall_score}分 ({new Date(a.started_at).toLocaleDateString()})
        </option>
      ))}
    </select>
  );

  const renderDelta = (delta: number) => {
    const color = delta > 0 ? "var(--color-success)" : delta < 0 ? "var(--color-error)" : "var(--text-muted)";
    const prefix = delta > 0 ? "+" : "";
    return (
      <span className="text-sm font-medium" style={{ color, fontFamily: "var(--font-mono)" }}>
        {prefix}{delta}
      </span>
    );
  };

  const renderInsight = (insight: ReportInsight, type: "new" | "removed" | "neutral") => {
    const color =
      type === "new" ? "var(--color-success)" : type === "removed" ? "var(--color-error)" : "var(--text-primary)";
    return (
      <li
        key={insight.id}
        className="flex items-start gap-2 py-2 px-3 rounded-lg"
        style={{ background: "var(--bg-elevated)" }}
      >
        <span
          className="inline-flex items-center justify-center shrink-0 w-5 h-5 rounded text-xs font-medium"
          style={{
            background: type === "new" ? "var(--color-success)20" : type === "removed" ? "var(--color-error)20" : "var(--bg-hover)",
            color,
            fontFamily: "var(--font-display)",
          }}
        >
          {type === "new" ? "+" : type === "removed" ? "-" : "·"}
        </span>
        <span className="text-sm" style={{ color, fontFamily: "var(--font-body)" }}>
          {insight.text}
        </span>
      </li>
    );
  };

  const renderResults = () => {
    if (comparing) {
      return (
        <div className="grid grid-cols-2 gap-6">
          {[1, 2].map((col) => (
            <div key={col} style={sectionCard}>
              <div className="space-y-4">
                <div className="h-8 w-24 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                <div className="h-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (compareError) {
      return (
        <div style={sectionCard}>
          <p className="text-sm text-center py-8" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>
            对比失败，请重试
          </p>
        </div>
      );
    }

    if (!result) return null;

    const { audit_a, audit_b, delta } = result;
    const labelA = `审计 A (#${audit_a.id})`;
    const labelB = `审计 B (#${audit_b.id})`;

    return (
      <div className="space-y-6">
        {/* Score summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div style={{ ...sectionCard, textAlign: "center" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{labelA}</p>
            <p className="text-3xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {audit_a.overall_score}
            </p>
          </div>
          <div style={{ ...sectionCard, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>总分变化</p>
            <p className="text-3xl font-bold" style={{ fontFamily: "var(--font-mono)", color: delta.overall_score > 0 ? "var(--color-success)" : delta.overall_score < 0 ? "var(--color-error)" : "var(--text-primary)" }}>
              {delta.overall_score > 0 ? "+" : ""}{delta.overall_score}
            </p>
          </div>
          <div style={{ ...sectionCard, textAlign: "center" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{labelB}</p>
            <p className="text-3xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {audit_b.overall_score}
            </p>
          </div>
        </div>

        {/* Radar chart + Pivot table side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Radar chart */}
          <div style={sectionCard}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              平台维度雷达图
            </h3>
            <div style={{ height: 320 }}>
              <CompareRadarChart
                labelA={labelA}
                dataA={audit_a.platforms}
                labelB={labelB}
                dataB={audit_b.platforms}
              />
            </div>
          </div>

          {/* Pivot table */}
          <div style={sectionCard}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              平台得分透视表
            </h3>
            <ComparePivotTable
              labelA={labelA}
              dataA={audit_a.platforms}
              labelB={labelB}
              dataB={audit_b.platforms}
              delta={delta.platforms}
            />
          </div>
        </div>

        {/* Insights comparison */}
        {(delta.new_insights.length > 0 || delta.removed_insights.length > 0) && (
          <div style={sectionCard}>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              洞察变化
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
                  审计 A 洞察
                </p>
                <ul className="space-y-2">
                  {audit_a.insights.map((ins) => renderInsight(ins, "neutral"))}
                  {delta.removed_insights.map((ins) => renderInsight(ins, "removed"))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
                  审计 B 洞察
                </p>
                <ul className="space-y-2">
                  {audit_b.insights.map((ins) => renderInsight(ins, "neutral"))}
                  {delta.new_insights.map((ins) => renderInsight(ins, "new"))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // No project selected
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比不同审计的分析结果" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  if (!loading && completedAudits.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比不同审计的分析结果" />
        <div style={sectionCard}>
          <EmptyState
            icon={GitCompare}
            title="至少需要 2 次审计才能对比"
            description="完成更多审计后即可使用对比功能"
            actionLabel="前往审计列表"
            actionHref="/visibility"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="竞品对比" subtitle="对比不同审计的分析结果" />

      {/* Selectors */}
      <div style={sectionCard}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              审计 A
            </label>
            {renderSelect(auditA, setAuditA, "选择审计...")}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              审计 B
            </label>
            {renderSelect(auditB, setAuditB, "选择审计...")}
          </div>
          <button
            onClick={handleCompare}
            disabled={!auditA || !auditB || comparing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: auditA && auditB && !comparing ? "var(--color-primary)" : "var(--bg-hover)",
              color: auditA && auditB && !comparing ? "#0b0d14" : "var(--text-muted)",
              border: "none",
              cursor: auditA && auditB && !comparing ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body)",
            }}
          >
            {comparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
            对比
          </button>
        </div>
      </div>

      {renderResults()}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-20 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="grid grid-cols-2 gap-6">
            <div className="h-40 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            <div className="h-40 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          </div>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
