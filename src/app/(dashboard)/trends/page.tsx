"use client";

import React, { Suspense, useState, useMemo } from "react";
import { TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
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
import type { TrendData, TrendAnnotation, AuditListItem } from "@/types/visibility";
import { sectionCard } from "@/components/charts/shared";
import { getAuditStatus, isAuditFinished } from "@/lib/audit-status";

type Period = "daily" | "weekly" | "monthly";

interface TrendsResponse {
  trends: TrendData[];
  annotations?: TrendAnnotation[];
}

function SummaryCard({ label, value, delta, icon: Icon }: {
  label: string;
  value: string | number;
  delta?: number | null;
  icon: React.ElementType;
}) {
  const deltaColor = delta == null ? "var(--text-muted)" : delta > 0 ? "var(--color-success)" : delta < 0 ? "var(--color-error)" : "var(--text-muted)";
  const DeltaIcon = delta != null && delta > 0 ? ArrowUpRight : delta != null && delta < 0 ? ArrowDownRight : Minus;

  return (
    <div style={sectionCard}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          {value}
        </span>
        {delta != null && (
          <span className="flex items-center text-xs font-medium" style={{ color: deltaColor, fontFamily: "var(--font-mono)" }}>
            <DeltaIcon className="w-3 h-3" />
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
    </div>
  );
}

function PlatformTrendTable({ trends }: { trends: TrendData[] }) {
  if (trends.length === 0) return null;

  const platformNames = [...new Set(trends.flatMap((t) => t.platforms.map((p) => p.platform)))];
  const latest = trends[trends.length - 1];
  const previous = trends.length > 1 ? trends[trends.length - 2] : null;

  return (
    <div style={sectionCard}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        平台明细
      </h3>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th className="text-left text-xs font-medium pb-2 pr-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>平台</th>
            <th className="text-right text-xs font-medium pb-2 pr-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>得分</th>
            <th className="text-right text-xs font-medium pb-2 pr-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>变化</th>
            <th className="text-left text-xs font-medium pb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)", width: "40%" }}>趋势</th>
          </tr>
        </thead>
        <tbody>
          {platformNames.map((name) => {
            const latestScore = latest.platforms.find((p) => p.platform === name)?.score ?? 0;
            const prevScore = previous?.platforms.find((p) => p.platform === name)?.score;
            const delta = prevScore != null ? latestScore - prevScore : null;
            const deltaColor = delta == null ? "var(--text-muted)" : delta > 0 ? "var(--color-success)" : delta < 0 ? "var(--color-error)" : "var(--text-muted)";

            // Build sparkline data: array of scores for this platform
            const sparkline = trends.map((t) => {
              const p = t.platforms.find((p) => p.platform === name);
              return p?.score ?? 0;
            });
            const sparkMin = Math.min(...sparkline);
            const sparkMax = Math.max(...sparkline);
            const sparkRange = sparkMax - sparkMin || 1;

            return (
              <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="py-2.5 pr-4">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{name}</span>
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{latestScore}</span>
                </td>
                <td className="py-2.5 pr-4 text-right">
                  {delta != null ? (
                    <span className="text-sm font-medium" style={{ color: deltaColor, fontFamily: "var(--font-mono)" }}>
                      {delta > 0 ? "+" : ""}{delta}
                    </span>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>--</span>
                  )}
                </td>
                <td className="py-2.5">
                  <svg viewBox={`0 0 ${sparkline.length * 20} 24`} style={{ width: "100%", height: 24, display: "block" }}>
                    <polyline
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={sparkline.map((v, i) => `${i * 20 + 10},${22 - ((v - sparkMin) / sparkRange) * 18}`).join(" ")}
                    />
                  </svg>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditTimeline({ audits }: { audits: AuditListItem[] }) {
  if (audits.length === 0) return null;

  return (
    <div style={sectionCard}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        审计历史
      </h3>
      <div className="space-y-0">
        {audits.slice(0, 8).map((audit, i) => {
          const date = audit.completed_at || audit.started_at;
          const isCompleted = isAuditFinished(getAuditStatus(audit));
          return (
            <div
              key={audit.id}
              className="flex items-start gap-3 py-2"
              style={{ borderLeft: "2px solid", borderLeftColor: isCompleted ? "var(--color-success)" : "var(--color-warning)", paddingLeft: 12, marginLeft: 4 }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {date ? new Date(date).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--"}
                </span>
                {audit.overall_score != null && (
                  <span className="ml-2 text-xs font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {audit.overall_score}分
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [period, setPeriod] = useState<Period>("weekly");

  const trendsUrl = currentProjectId
    ? `/api/integration/trends?projectId=${currentProjectId}&period=${period}`
    : null;
  const { data, loading: trendsLoading, error, refetch } = useSectionFetch<TrendsResponse>(trendsUrl);

  const auditsUrl = currentProjectId
    ? `/api/integration/audits?projectId=${currentProjectId}`
    : null;
  const { data: auditsData } = useSectionFetch<AuditListItem[]>(auditsUrl);

  const trends = data?.trends ?? [];
  const annotations = data?.annotations ?? [];
  const audits = auditsData ?? [];

  const periodButtons: { key: Period; label: string }[] = [
    { key: "daily", label: "日" },
    { key: "weekly", label: "周" },
    { key: "monthly", label: "月" },
  ];

  const platformNames = trends.length > 0
    ? [...new Set(trends.flatMap((t) => t.platforms.map((p) => p.platform)))]
    : [];

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

  // Summary metrics
  const latestTrend = trends.length > 0 ? trends[trends.length - 1] : null;
  const prevTrend = trends.length > 1 ? trends[trends.length - 2] : null;
  const scoreDelta = latestTrend && prevTrend ? latestTrend.overall_score - prevTrend.overall_score : null;

  const bestPlatform = latestTrend
    ? latestTrend.platforms.reduce((best, p) => p.score > best.score ? p : best, latestTrend.platforms[0] ?? { platform: "--", score: 0 })
    : null;
  const worstPlatform = latestTrend
    ? latestTrend.platforms.reduce((worst, p) => p.score < worst.score ? p : worst, latestTrend.platforms[0] ?? { platform: "--", score: 100 })
    : null;

  const annotationMap = new Map(annotations.map((a) => [a.date, a.text]));

  // No project selected
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

      {trendsLoading && trends.length === 0 ? (
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
            </svg>
          </div>
        </div>
      ) : error ? (
        <div style={sectionCard}>
          <ErrorState onRetry={refetch} />
        </div>
      ) : trends.length === 0 ? (
        <div style={sectionCard}>
          <EmptyState
            icon={TrendingUp}
            title="暂无趋势数据"
            description="至少完成 2 次审计后可查看趋势"
            actionLabel="前往可见性分析"
            actionHref="/visibility"
          />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="最新总分" value={latestTrend?.overall_score ?? "--"} delta={scoreDelta} icon={TrendingUp} />
            <SummaryCard label="总分变化" value={scoreDelta != null ? (scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`) : "--"} icon={ArrowUpRight} />
            <SummaryCard label="最佳平台" value={bestPlatform ? `${bestPlatform.platform} ${bestPlatform.score}` : "--"} icon={TrendingUp} />
            <SummaryCard label="最弱平台" value={worstPlatform ? `${worstPlatform.platform} ${worstPlatform.score}` : "--"} icon={ArrowDownRight} />
          </div>

          {/* Main chart area */}
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

            <div style={{ height: 320 }}>
              <TrendLineChart chartData={chartData} platformNames={platformNames} />
            </div>

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

          {/* Platform table + Audit timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <PlatformTrendTable trends={trends} />
            </div>
            <div>
              <AuditTimeline audits={audits} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TrendsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
          <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <TrendsContent />
    </Suspense>
  );
}
