"use client";

import React, { Suspense, useState, useEffect } from "react";
import {
  Target,
  Globe,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
} from "lucide-react";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import SourceAuthorityTrends from "@/components/charts/SourceAuthorityTrends";
import CompetitorPositioningMap from "@/components/charts/CompetitorPositioningMap";
import StructureEvolution from "@/components/charts/StructureEvolution";

import type { StrategicData } from "@/types/visibility";

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "20px 24px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const TABS = [
  { key: "source-authority", label: "来源权威趋势", icon: Globe },
  { key: "competitor-positioning", label: "竞品定位地图", icon: Target },
  { key: "structure-evolution", label: "回答结构演变", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Fetch hook for per-tab data */
function useStrategicData<T>(projectId: string | null, tabKey: TabKey) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const url = projectId ? `/api/integration/strategic/${tabKey}?projectId=${projectId}` : null;

  useEffect(() => {
    if (!url) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, tabKey]);

  return { data, loading, error };
}

/** Tab 1: Source Authority Trends */
function SourceAuthorityTab({ projectId }: { projectId: string }) {
  const { data, loading, error } = useStrategicData<StrategicData["source_authority"]>(projectId, "source-authority");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (error) return <div style={cardStyle}><ErrorState onRetry={() => window.location.reload()} /></div>;
  if (!data || data.length === 0) {
    return <div style={cardStyle}><EmptyState icon={Globe} title="暂无来源权威数据" description="运行审计后可查看来源权威趋势" /></div>;
  }

  // Build trend table data
  const latestPeriod = data[data.length - 1];
  const prevPeriod = data.length > 1 ? data[data.length - 2] : null;

  return (
    <div className="space-y-6">
      {/* Domain authority trend line chart */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <Globe style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          域名权威趋势
        </div>
        <div style={{ height: 320 }}>
          <SourceAuthorityTrends data={data} />
        </div>
      </div>

      {/* Authority trend table */}
      {latestPeriod && (
        <div style={cardStyle}>
          <div style={sectionTitle}>
            <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
            权威度趋势表
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>来源</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>权威度</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>变化</th>
                </tr>
              </thead>
              <tbody>
                {latestPeriod.sources.map((src, i) => {
                  const prev = prevPeriod?.sources.find((s) => s.source === src.source);
                  const delta = prev ? src.authority - prev.authority : 0;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-primary)" }}>{src.source}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{src.authority}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: delta > 0 ? "var(--color-success)" : delta < 0 ? "var(--color-error)" : "var(--text-muted)" }}>
                          {delta > 0 ? <ArrowUpRight style={{ width: 14, height: 14 }} /> : delta < 0 ? <ArrowDownRight style={{ width: 14, height: 14 }} /> : <Minus style={{ width: 14, height: 14 }} />}
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab 2: Competitor Positioning Map */
function CompetitorPositioningTab({ projectId }: { projectId: string }) {
  const { data, loading, error } = useStrategicData<StrategicData["competitor_positioning"]>(projectId, "competitor-positioning");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (error) return <div style={cardStyle}><ErrorState onRetry={() => window.location.reload()} /></div>;
  if (!data || data.length === 0) {
    return <div style={cardStyle}><EmptyState icon={Target} title="暂无竞品定位数据" description="运行审计后可查看竞品定位地图" /></div>;
  }

  // Brand ranking table sorted by score
  const ranked = [...data].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      {/* Scatter quadrant chart */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <Target style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          品牌定位象限图
        </div>
        <div style={{ height: 380 }}>
          <CompetitorPositioningMap data={data} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--color-primary)", marginRight: 4, verticalAlign: "middle" }} />
          自有品牌
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--color-warning)", marginLeft: 16, marginRight: 4, verticalAlign: "middle" }} />
          竞品品牌
        </div>
      </div>

      {/* Brand ranking table */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          品牌排名
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>排名</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>品牌</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>评分</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>可见度</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((brand, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: brand.is_own ? "var(--color-primary)08" : undefined }}>
                  <td style={{ padding: "8px 12px", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", fontWeight: brand.is_own ? 600 : 400 }}>
                    {brand.is_own && <span style={{ color: "var(--color-primary)", marginRight: 6 }}>*</span>}
                    {brand.brand}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{brand.score}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{brand.visibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Tab 3: Structure Evolution */
function StructureEvolutionTab({ projectId }: { projectId: string }) {
  const { data, loading, error } = useStrategicData<StrategicData["structure_evolution"]>(projectId, "structure-evolution");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (error) return <div style={cardStyle}><ErrorState onRetry={() => window.location.reload()} /></div>;
  if (!data || data.length === 0) {
    return <div style={cardStyle}><EmptyState icon={BarChart3} title="暂无结构演变数据" description="运行多次审计后可查看结构演变趋势" /></div>;
  }

  // Compute changes between periods
  const changes: { period: string; structured_delta: number; semi_structured_delta: number; unstructured_delta: number }[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push({
      period: data[i].period,
      structured_delta: data[i].structured - data[i - 1].structured,
      semi_structured_delta: data[i].semi_structured - data[i - 1].semi_structured,
      unstructured_delta: data[i].unstructured - data[i - 1].unstructured,
    });
  }

  return (
    <div className="space-y-6">
      {/* Stacked bar chart */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          结构类型演变
        </div>
        <div style={{ height: 320 }}>
          <StructureEvolution data={data} />
        </div>
      </div>

      {/* Correlation table */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          结构类型与提及率相关性
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>期间</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>结构化</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>半结构化</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>非结构化</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-primary)" }}>{row.period}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{row.structured}%</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{row.semi_structured}%</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{row.unstructured}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change records */}
      {changes.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>
            <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
            变化记录
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {changes.map((ch, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--bg-hover)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600, minWidth: 80 }}>{ch.period}</span>
                <span style={{ color: ch.structured_delta > 0 ? "var(--color-success)" : ch.structured_delta < 0 ? "var(--color-error)" : "var(--text-muted)" }}>
                  结构化 {ch.structured_delta > 0 ? "+" : ""}{ch.structured_delta}%
                </span>
                <span style={{ color: ch.semi_structured_delta > 0 ? "var(--color-success)" : ch.semi_structured_delta < 0 ? "var(--color-error)" : "var(--text-muted)" }}>
                  半结构化 {ch.semi_structured_delta > 0 ? "+" : ""}{ch.semi_structured_delta}%
                </span>
                <span style={{ color: ch.unstructured_delta > 0 ? "var(--color-error)" : ch.unstructured_delta < 0 ? "var(--color-success)" : "var(--text-muted)" }}>
                  非结构化 {ch.unstructured_delta > 0 ? "+" : ""}{ch.unstructured_delta}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StrategicContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>("source-authority");

  // No project selected
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="战略智能" subtitle="深度战略分析与竞争洞察" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    fontFamily: "var(--font-body)",
    border: "none",
    cursor: "pointer",
    background: active ? "var(--color-primary)15" : "transparent",
    color: active ? "var(--color-primary)" : "var(--text-secondary)",
    transition: "all 0.15s",
  });

  return (
    <div className="space-y-6">
      <PageHeader title="战略智能" subtitle="深度战略分析与竞争洞察" />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "4px", background: "var(--bg-hover)", borderRadius: 10, width: "fit-content" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={tabButtonStyle(activeTab === tab.key)}
          >
            <tab.icon style={{ width: 16, height: 16 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — lazy loaded per tab */}
      {currentProjectId && activeTab === "source-authority" && (
        <SourceAuthorityTab projectId={currentProjectId} />
      )}
      {currentProjectId && activeTab === "competitor-positioning" && (
        <CompetitorPositioningTab projectId={currentProjectId} />
      )}
      {currentProjectId && activeTab === "structure-evolution" && (
        <StructureEvolutionTab projectId={currentProjectId} />
      )}
    </div>
  );
}

export default function StrategicPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <StrategicContent />
    </Suspense>
  );
}
