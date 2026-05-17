"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, Calendar } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import type { TrendData, TrendAnnotation } from "@/types/visibility";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

const PLATFORM_COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-error)",
  "#a78bfa",
  "#f472b6",
];

type Period = "daily" | "weekly" | "monthly";

interface Project {
  id: string;
  name: string;
}

interface TrendsResponse {
  trends: TrendData[];
  annotations?: TrendAnnotation[];
}

function TrendsContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("weekly");

  const projectIdParam = searchParams.get("project");
  const currentProject = projectIdParam
    ? projects.find((p) => p.id === projectIdParam)
    : projects[0];
  const currentProjectId = currentProject?.id;

  const trendsUrl = currentProjectId
    ? `/api/integration/trends?projectId=${currentProjectId}`
    : "/api/integration/trends";
  const { data, loading, error, refetch } = useSectionFetch<TrendsResponse>(trendsUrl);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.projects) setProjects(data.projects);
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

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

  // Build polyline points for each platform
  const getPoints = useCallback(
    (platform: string) => {
      if (trends.length === 0) return "";
      return trends
        .map((t, i) => {
          const x = trends.length === 1 ? 50 : (i / (trends.length - 1)) * 100;
          const entry = t.platforms.find((p) => p.platform === platform);
          const y = entry ? 100 - entry.score : 100;
          return `${x},${y}`;
        })
        .join(" ");
    },
    [trends]
  );

  // Overall score polyline
  const getOverallPoints = useCallback(() => {
    if (trends.length === 0) return "";
    return trends
      .map((t, i) => {
        const x = trends.length === 1 ? 50 : (i / (trends.length - 1)) * 100;
        const y = 100 - t.overall_score;
        return `${x},${y}`;
      })
      .join(" ");
  }, [trends]);

  // Annotation lookup by date
  const annotationMap = new Map(annotations.map((a) => [a.date, a.text]));

  const renderChart = () => {
    if (loading) {
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

    if (error || trends.length === 0) {
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
        <div className="relative" style={{ height: 280 }}>
          <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--border)" strokeWidth="0.3" />
            ))}

            {/* Overall score line */}
            <polyline
              points={getOverallPoints()}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity={0.6}
            />

            {/* Platform lines */}
            {platformNames.map((platform, idx) => (
              <polyline
                key={platform}
                points={getPoints(platform)}
                fill="none"
                stroke={PLATFORM_COLORS[idx % PLATFORM_COLORS.length]}
                strokeWidth="1"
                strokeLinejoin="round"
              />
            ))}

            {/* Data points - overall */}
            {trends.map((t, i) => {
              const x = trends.length === 1 ? 50 : (i / (trends.length - 1)) * 100;
              const y = 100 - t.overall_score;
              const annotationText = annotationMap.get(t.period);
              return (
                <g key={`overall-${i}`}>
                  <circle cx={x} cy={y} r="1.5" fill="var(--text-primary)" opacity={0.6}>
                    {annotationText && <title>{annotationText}</title>}
                  </circle>
                </g>
              );
            })}

            {/* Data points - per platform */}
            {platformNames.map((platform, pidx) =>
              trends.map((t, i) => {
                const entry = t.platforms.find((p) => p.platform === platform);
                if (!entry) return null;
                const x = trends.length === 1 ? 50 : (i / (trends.length - 1)) * 100;
                const y = 100 - entry.score;
                return (
                  <circle
                    key={`${platform}-${i}`}
                    cx={x}
                    cy={y}
                    r="1"
                    fill={PLATFORM_COLORS[pidx % PLATFORM_COLORS.length]}
                  />
                );
              })
            )}
          </svg>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between pointer-events-none" style={{ width: 28, transform: "translateX(-100%)", paddingRight: 8 }}>
            {[100, 75, 50, 25, 0].map((v) => (
              <span key={v} className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2" style={{ marginLeft: 28 }}>
          {trends.map((t, i) => (
            <span key={i} className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {t.period}
            </span>
          ))}
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

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ background: "var(--text-primary)", opacity: 0.6 }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>总分</span>
          </div>
          {platformNames.map((platform, idx) => (
            <div key={platform} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded" style={{ background: PLATFORM_COLORS[idx % PLATFORM_COLORS.length] }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{platform}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="趋势分析" subtitle="追踪 AI 可见性得分变化趋势" />
        <div style={sectionCard}>
          <EmptyState
            icon={TrendingUp}
            title="暂无项目"
            description="请先创建项目以查看趋势数据"
            actionLabel="创建项目"
            actionHref="/projects"
          />
        </div>
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
