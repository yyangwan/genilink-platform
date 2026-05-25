"use client";

import React, { Suspense, useState, useMemo } from "react";
import { TrendingUp, Calendar } from "lucide-react";
import dynamic from "next/dynamic";

const TrendLineChart = dynamic(
  () => import("@/components/charts/TrendLineChart"),
  { ssr: false },
);
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import type { TrendData, TrendAnnotation } from "@/types/visibility";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

type Period = "daily" | "weekly" | "monthly";

interface TrendsResponse {
  trends: TrendData[];
  annotations?: TrendAnnotation[];
}

function TrendsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [period, setPeriod] = useState<Period>("weekly");

  const trendsUrl = currentProjectId
    ? `/api/integration/trends?projectId=${currentProjectId}&period=${period}`
    : null;
  const { data, loading: trendsLoading, error, refetch } = useSectionFetch<TrendsResponse>(trendsUrl);

  const trends = data?.trends ?? [];
  const annotations = data?.annotations ?? [];

  const periodButtons: { key: Period; label: string }[] = [
    { key: "daily", label: "日" },
    { key: "weekly", label: "周" },
    { key: "monthly", label: "月" },
  ];

  // Collect unique platform names across all data points
  const platformNames = trends.length > 0
    ? [...new Set(trends.flatMap((t) => t.platforms.map((p) => p.platform)))]
    : [];

  // Transform data for recharts: flat array with period + overall + per-platform scores
  const chartData = useMemo(() => {
    return trends.map((t) => {
      const entry: Record<string, string | number> = {
        period: t.period,
        总分: t.overall_score,
      };
      for (const p of t.platforms) {
        entry[p.platform] = p.score;
      }
      return entry;
    });
  }, [trends]);

  // Annotation lookup by date
  const annotationMap = new Map(annotations.map((a) => [a.date, a.text]));

  const renderChart = () => {
    if (trendsLoading) {
      return (
        <div style={sectionCard}>
          <div className="space-y-4">
            <div className="flex justify-between">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 w-12 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
              ))}
            </div>
            <svg viewBox="0 0 100 100" className="w-full" style={{ height: 280 }}>
              <line x1="0" y1="0" x2="100" y2="0" stroke="var(--border)" strokeWidth="0.3" />
              <line x1="0" y1="25" x2="100" y2="25" stroke="var(--border)" strokeWidth="0.3" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.3" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="var(--border)" strokeWidth="0.3" />
              <line x1="0" y1="100" x2="100" y2="100" stroke="var(--border)" strokeWidth="0.3" />
            </svg>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div style={sectionCard}>
          <ErrorState onRetry={refetch} />
        </div>
      );
    }

    if (trends.length === 0) {
      return (
        <div style={sectionCard}>
          <EmptyState
            icon={TrendingUp}
            title="暂无趋势数据"
            description="至少完成 2 次审计后可查看趋势"
            actionLabel="前往可见性分析"
            actionHref="/visibility"
          />
        </div>
      );
    }

    return (
      <div style={sectionCard}>
        {/* Period selector */}
        <div className="flex items-center gap-2 mb-6">
          {periodButtons.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: period === p.key ? "var(--color-primary)" : "var(--bg-elevated)",
                color: period === p.key ? "#0b0d14" : "var(--text-secondary)",
                border: period === p.key ? "none" : "1px solid var(--border)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ height: 320 }}>
          <TrendLineChart chartData={chartData} platformNames={platformNames} />
        </div>

        {/* Annotation markers */}
        {annotations.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {annotations.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                style={{
                  background: "var(--color-primary-dim)",
                  color: "var(--color-primary)",
                  fontFamily: "var(--font-body)",
                }}
                title={a.text}
              >
                <Calendar className="w-3 h-3" />
                {a.date}: {a.text}
              </span>
            ))}
          </div>
        )}

      </div>
    );
  };

  // No project selected — show diagnostic checklist
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="趋势分析" subtitle="追踪 AI 可见性得分变化趋势" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="趋势分析" subtitle="追踪 AI 可见性得分变化趋势" />
      {renderChart()}
    </div>
  );
}

export default function TrendsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <TrendsContent />
    </Suspense>
  );
}
