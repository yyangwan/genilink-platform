"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useState, useEffect, useRef, useCallback } from "react";
import {
  Target,
  Globe,
  BarChart3,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import SourceAuthorityTrends from "@/components/charts/SourceAuthorityTrends";
import CompetitorPositioningMap from "@/components/charts/CompetitorPositioningMap";
import StructureEvolution from "@/components/charts/StructureEvolution";

import type { StrategicData, AuditHistoryItem, MultiAuditComparison } from "@/types/visibility";

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
  { key: "multi-audit-compare", label: "多审计对比", icon: GitCompare },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Fetch hook for per-tab data with AbortController + billing guard */
function useStrategicData<T>(projectId: string | null, tabKey: TabKey) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const url = projectId ? `/api/integration/strategic/${tabKey}?projectId=${projectId}` : null;

  useEffect(() => {
    if (!url) { setData(null); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(false);
    setLocked(false);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (res.status === 403) { setLocked(true); setLoading(false); return null; }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((d) => { if (d !== null) setData(d); })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => { controller.abort(); };
  }, [url, tabKey]);

  return { data, loading, error, locked };
}

/** Tab 1: Source Authority Trends */
function SourceAuthorityTab({ projectId }: { projectId: string }) {
  const { data, loading, error, locked } = useStrategicData<StrategicData["source_authority"]>(projectId, "source-authority");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (locked) return <div style={cardStyle}><EmptyState icon={Globe} title="需要升级" description="战略智能功能需要订阅智见专业版" /></div>;
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
  const { data, loading, error, locked } = useStrategicData<StrategicData["competitor_positioning"]>(projectId, "competitor-positioning");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (locked) return <div style={cardStyle}><EmptyState icon={Target} title="需要升级" description="战略智能功能需要订阅智见专业版" /></div>;
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
  const { data, loading, error, locked } = useStrategicData<StrategicData["structure_evolution"]>(projectId, "structure-evolution");

  if (loading) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (locked) return <div style={cardStyle}><EmptyState icon={BarChart3} title="需要升级" description="战略智能功能需要订阅智见专业版" /></div>;
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

/** Tab 4: Multi-Audit Compare */
function MultiAuditCompareTab({ projectId }: { projectId: string }) {
  const [audits, setAudits] = useState<AuditHistoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState(false);
  const [result, setResult] = useState<MultiAuditComparison | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch audits history on mount
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingHistory(true);
    setHistoryError(false);
    setLocked(false);

    fetch(`/api/integration/trends/audits-history?projectId=${projectId}`, { signal: controller.signal })
      .then((res) => {
        if (res.status === 403) { setLocked(true); setLoadingHistory(false); return null; }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((d) => { if (d) setAudits(Array.isArray(d) ? d : []); })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setHistoryError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });

    return () => { controller.abort(); };
  }, [projectId]);

  // Reset comparison when selection changes
  useEffect(() => { setResult(null); setCompareError(false); }, [selectedIds]);

  const toggleAudit = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const runCompare = async () => {
    if (selectedIds.size < 2) return;
    setComparing(true);
    setCompareError(false);
    setResult(null);

    try {
      const res = await fetch(`/api/integration/strategic/compare-audits?projectId=${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_ids: [...selectedIds] }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data);
    } catch {
      setCompareError(true);
    } finally {
      setComparing(false);
    }
  };

  if (loadingHistory) return <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />;
  if (locked) return <div style={cardStyle}><EmptyState icon={GitCompare} title="需要升级" description="战略智能功能需要订阅智见专业版" /></div>;
  if (historyError) return <div style={cardStyle}><ErrorState onRetry={() => window.location.reload()} /></div>;

  const completedAudits = audits.filter((a) => a.status === "completed" || a.status === "partial");

  if (completedAudits.length < 2) {
    return <div style={cardStyle}><EmptyState icon={GitCompare} title="审计数量不足" description="需要至少 2 次已完成的审计才能进行对比" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Audit selection */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <GitCompare style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
          选择审计 (2-5)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {completedAudits.map((audit) => {
            const selected = selectedIds.has(audit.id);
            const disabled = !selected && selectedIds.size >= 5;
            return (
              <label
                key={audit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: selected ? "var(--color-primary)10" : "var(--bg-hover)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => toggleAudit(audit.id)}
                  style={{ accentColor: "var(--color-primary)" }}
                />
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>#{audit.id}</span>
                <span style={{ color: "var(--text-muted)" }}>{new Date(audit.created_at).toLocaleDateString("zh-CN")}</span>
                {audit.platforms?.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>({audit.platforms.join(", ")})</span>
                )}
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={runCompare}
            disabled={selectedIds.size < 2 || comparing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              border: "none",
              cursor: selectedIds.size < 2 || comparing ? "not-allowed" : "pointer",
              background: selectedIds.size < 2 || comparing ? "var(--bg-hover)" : "var(--color-primary)",
              color: selectedIds.size < 2 || comparing ? "var(--text-muted)" : "#fff",
              opacity: comparing ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {comparing && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            {comparing ? "对比中..." : "开始对比"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            已选 {selectedIds.size}/5
          </span>
        </div>
      </div>

      {/* Compare error */}
      {compareError && <div style={cardStyle}><ErrorState onRetry={runCompare} /></div>}

      {/* Comparison results */}
      {result && (
        <>
          {/* Diff summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {[
              {
                label: "评分变化",
                value: result.diffs.score_delta,
                fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
              },
              {
                label: "提及率变化",
                value: result.diffs.mention_rate_delta,
                fmt: (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`,
              },
              {
                label: "新增来源",
                value: result.diffs.source_changes.added.length,
                fmt: (v: number) => `+${v}`,
              },
              {
                label: "减少来源",
                value: result.diffs.source_changes.removed.length,
                fmt: (v: number) => `-${v}`,
              },
            ].map((card, i) => (
              <div key={i} style={{ ...cardStyle, padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: 4 }}>{card.label}</div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: i === 3 ? "var(--color-error)" : card.value > 0 ? "var(--color-success)" : card.value < 0 ? "var(--color-error)" : "var(--text-primary)",
                }}>
                  {card.fmt(card.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Audit snapshots */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
            {result.audits.map((snap) => (
              <div key={snap.audit_id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    审计 #{snap.audit_id}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{snap.date}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>评分</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{snap.overall_score}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>提及率</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{(snap.mention_rate * 100).toFixed(1)}%</div>
                  </div>
                </div>
                {/* Sentiment breakdown */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {Object.entries(snap.sentiment_breakdown).map(([key, val]) => (
                    <span key={key} style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontFamily: "var(--font-body)",
                      background: key === "positive" ? "var(--color-success)15" : key === "negative" ? "var(--color-error)15" : "var(--bg-hover)",
                      color: key === "positive" ? "var(--color-success)" : key === "negative" ? "var(--color-error)" : "var(--text-muted)",
                    }}>
                      {key === "positive" ? "正面" : key === "negative" ? "负面" : "中性"} {val}
                    </span>
                  ))}
                </div>
                {/* Top sources */}
                {snap.top_sources.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: 4 }}>Top 来源</div>
                    {snap.top_sources.slice(0, 5).map((s, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                        <span>{s.domain}</span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Source changes */}
          {(result.diffs.source_changes.added.length > 0 || result.diffs.source_changes.removed.length > 0) && (
            <div style={cardStyle}>
              <div style={sectionTitle}>
                <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                来源变化
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-success)", fontWeight: 600, fontFamily: "var(--font-body)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <Check style={{ width: 14, height: 14 }} /> 新增
                  </div>
                  {result.diffs.source_changes.added.map((d, i) => (
                    <span key={i} style={{ display: "inline-block", fontSize: 12, padding: "3px 10px", borderRadius: 4, margin: "0 4px 4px 0", background: "var(--color-success)10", color: "var(--color-success)", fontFamily: "var(--font-body)" }}>{d}</span>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-error)", fontWeight: 600, fontFamily: "var(--font-body)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <X style={{ width: 14, height: 14 }} /> 减少
                  </div>
                  {result.diffs.source_changes.removed.map((d, i) => (
                    <span key={i} style={{ display: "inline-block", fontSize: 12, padding: "3px 10px", borderRadius: 4, margin: "0 4px 4px 0", background: "var(--color-error)10", color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Competitor changes */}
          {result.diffs.competitor_changes.length > 0 && (
            <div style={cardStyle}>
              <div style={sectionTitle}>
                <Target style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                竞品提及率变化
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>品牌</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.diffs.competitor_changes]
                      .sort((a, b) => b.delta - a.delta)
                      .map((ch, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-primary)" }}>{ch.brand}</td>
                          <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: ch.delta > 0 ? "var(--color-success)" : ch.delta < 0 ? "var(--color-error)" : "var(--text-muted)" }}>
                              {ch.delta > 0 ? <ArrowUpRight style={{ width: 14, height: 14 }} /> : ch.delta < 0 ? <ArrowDownRight style={{ width: 14, height: 14 }} /> : <Minus style={{ width: 14, height: 14 }} />}
                              {ch.delta > 0 ? "+" : ""}{(ch.delta * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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

      {/* Tab content — hidden via CSS to preserve state */}
      <div style={{ display: activeTab === "source-authority" ? "block" : "none" }}>
        {currentProjectId && <SourceAuthorityTab projectId={currentProjectId} />}
      </div>
      <div style={{ display: activeTab === "competitor-positioning" ? "block" : "none" }}>
        {currentProjectId && <CompetitorPositioningTab projectId={currentProjectId} />}
      </div>
      <div style={{ display: activeTab === "structure-evolution" ? "block" : "none" }}>
        {currentProjectId && <StructureEvolutionTab projectId={currentProjectId} />}
      </div>
      <div style={{ display: activeTab === "multi-audit-compare" ? "block" : "none" }}>
        {currentProjectId && <MultiAuditCompareTab projectId={currentProjectId} />}
      </div>
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
