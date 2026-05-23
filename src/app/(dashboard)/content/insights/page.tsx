"use client";

import React, { Suspense, useCallback, useState } from "react";
import { TrendingUp, Eye, FileText, BarChart3 } from "lucide-react";
import { useProject } from "@/components/project/project-context";

interface AnalyticsData {
  totalContent: number;
  publishedCount: number;
  avgQuality: number;
  platformBreakdown?: { platform: string; count: number }[];
  statusBreakdown?: { status: string; count: number }[];
  topPerforming?: { id: string; title: string; score: number }[];
  recentActivity?: { date: string; count: number }[];
}

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "20px",
};

const metricStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "16px",
  flex: 1,
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  review: "审核中",
  scheduled: "已排期",
  published: "已发布",
  failed: "失败",
};

const statusColors: Record<string, string> = {
  draft: "var(--text-secondary)",
  review: "var(--color-warning)",
  scheduled: "color-mix(in srgb, var(--color-primary) 80%, white)",
  published: "var(--color-success)",
  failed: "var(--color-error)",
};

function InsightsInner() {
  const { currentProjectId } = useProject();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?projectId=${currentProjectId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setData(json.data ?? null);
    } catch {
      setError("加载洞察数据失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = [
    { icon: FileText, label: "总内容", value: data?.totalContent, color: "var(--color-primary)" },
    { icon: Eye, label: "已发布", value: data?.publishedCount, color: "var(--color-success)" },
    { icon: TrendingUp, label: "平均质量", value: data?.avgQuality != null ? data.avgQuality.toFixed(1) : null, color: "var(--color-warning)" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          内容洞察
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          分析内容表现和质量趋势
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-20 rounded-lg animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
          <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      ) : error ? (
        <div style={card} className="text-center py-8">
          <BarChart3 size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            重试
          </button>
        </div>
      ) : !data ? (
        <div style={card} className="text-center py-12">
          <BarChart3 size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            暂无分析数据
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            开始创建内容后，这里将展示分析数据
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="flex gap-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} style={{ ...card, ...metricStyle }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} style={{ color: kpi.color }} />
                    <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                      {kpi.label}
                    </span>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {kpi.value ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Status breakdown */}
          {data.statusBreakdown && data.statusBreakdown.length > 0 && (
            <div style={card}>
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                状态分布
              </h3>
              <div className="space-y-2">
                {data.statusBreakdown.map((item) => {
                  const maxCount = Math.max(...data.statusBreakdown!.map((s) => s.count), 1);
                  const pct = (item.count / maxCount) * 100;
                  return (
                    <div key={item.status} className="flex items-center gap-3">
                      <span className="text-xs w-14 shrink-0" style={{ color: statusColors[item.status] ?? "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                        {statusLabels[item.status] ?? item.status}
                      </span>
                      <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                        <div className="h-full rounded-sm transition-all" style={{
                          width: `${pct}%`,
                          background: statusColors[item.status] ?? "var(--color-primary)",
                          minWidth: item.count > 0 ? "8px" : undefined,
                        }} />
                      </div>
                      <span className="text-xs font-mono shrink-0 w-8 text-right" style={{ color: "var(--text-secondary)" }}>
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platform breakdown */}
          {data.platformBreakdown && data.platformBreakdown.length > 0 && (
            <div style={card}>
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                平台分布
              </h3>
              <div className="flex flex-wrap gap-3">
                {data.platformBreakdown.map((item) => (
                  <div key={item.platform} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: "var(--bg-hover)" }}
                  >
                    <span className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {item.platform}
                    </span>
                    <span className="text-sm font-mono font-medium" style={{ color: "var(--color-primary)" }}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top performing */}
          {data.topPerforming && data.topPerforming.length > 0 && (
            <div style={card}>
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                最佳内容
              </h3>
              <div className="space-y-2">
                {data.topPerforming.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-mono w-5 text-center shrink-0" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                      {i + 1}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {item.title || "无标题"}
                    </span>
                    <span className="text-sm font-mono shrink-0" style={{
                      color: item.score >= 80 ? "var(--color-success)" : item.score >= 60 ? "var(--color-warning)" : "var(--text-secondary)",
                    }}>
                      {item.score.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /><div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /></div>}>
      <InsightsInner />
    </Suspense>
  );
}
