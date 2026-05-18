"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { GitCompare, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditListItem, AuditComparison, ReportInsight } from "@/types/visibility";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

interface Project {
  id: string;
  name: string;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [auditA, setAuditA] = useState<string>("");
  const [auditB, setAuditB] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState(false);
  const [result, setResult] = useState<AuditComparison | null>(null);

  const projectIdParam = searchParams.get("project");
  const currentProject = projectIdParam
    ? projects.find((p) => p.id === projectIdParam)
    : projects[0];
  const currentProjectId = currentProject?.id;

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.projects) setProjects(data.projects);
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

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
                <div className="h-6 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                <div className="h-6 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
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

    return (
      <div className="space-y-6">
        {/* Score comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div style={sectionCard} className="text-center">
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              审计 A (#{audit_a.id})
            </p>
            <p className="text-4xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {audit_a.overall_score}
            </p>
          </div>
          <div style={sectionCard} className="text-center">
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              审计 B (#{audit_b.id})
            </p>
            <p className="text-4xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {audit_b.overall_score}
            </p>
            <div className="mt-2">{renderDelta(delta.overall_score)}</div>
          </div>
        </div>

        {/* Platform comparison */}
        {delta.platforms.length > 0 && (
          <div style={sectionCard}>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              平台得分对比
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {delta.platforms.map((p) => (
                <div key={p.platform} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    {p.platform}
                  </span>
                  {renderDelta(p.delta)}
                </div>
              ))}
            </div>
          </div>
        )}

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

  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比不同审计的分析结果" />
        <div style={sectionCard}>
          <EmptyState
            icon={GitCompare}
            title="暂无项目"
            description="请先创建项目以使用对比功能"
            actionLabel="创建项目"
            actionHref="/projects"
          />
        </div>
      </div>
    );
  }

  if (!projectsLoading && completedAudits.length < 2) {
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
