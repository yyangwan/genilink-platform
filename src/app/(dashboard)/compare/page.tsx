"use client";

import React, { Suspense, useState, useEffect, useMemo, useRef } from "react";
import { GitCompare, RefreshCw, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const CompareCharts = dynamic(
  () => import("@/components/charts/CompareCharts"),
  { ssr: false },
);

import { BRAND_COLORS, sectionCard } from "@/components/charts/shared";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";

interface Brand {
  id: number;
  name: string;
  is_competitor: boolean;
}

interface QueryResult {
  id: number;
  platform: string;
  prompt_text: string | null;
  brand_name: string | null;
  mention_found: boolean;
  is_recommended: boolean;
  recommendation_rank: number | null;
  mention_confidence: number | null;
}

interface GroupedRow {
  platform: string;
  promptText: string;
  brandResults: Record<string, QueryResult | undefined>;
  mentionGap: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  qwen: "通义千问",
  doubao: "豆包",
  kimi: "Kimi",
  hunyuan: "腾讯元宝",
};

function CompareContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterMentionOnly, setFilterMentionOnly] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const platformNames = PLATFORM_LABELS;
  const platformKeys = useMemo(
    () => [...new Set(results.map((r) => r.platform))].filter((p) => platformNames[p]),
    [results]
  );

  const loadData = async () => {
    if (!currentProjectId) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setDataLoading(true);
    setError("");
    setLocked(false);

    try {
      // 1. Get audits to find the latest one
      const auditsRes = await fetch(`/api/integration/audits?projectId=${currentProjectId}`, { signal });
      if (auditsRes.status === 403) { setLocked(true); setDataLoading(false); return; }
      if (!auditsRes.ok) throw new Error("获取审计数据失败");
      const auditsData = await auditsRes.json();
      const audits = auditsData.audits || auditsData;
      const completedAudits = (Array.isArray(audits) ? audits : []).filter(
        (a: { status: string }) => a.status === "completed"
      );

      if (completedAudits.length === 0) {
        setResults([]);
        setBrands([]);
        setDataLoading(false);
        return;
      }

      const latestAudit = completedAudits[0];

      // 2. Fetch brands and audit results in parallel
      const [brandsRes, resultsRes] = await Promise.all([
        fetch(`/api/integration/brands?projectId=${currentProjectId}`, { signal }),
        fetch(`/api/integration/audits/${latestAudit.id}/results?projectId=${currentProjectId}`, { signal }),
      ]);

      if (brandsRes.status === 403 || resultsRes.status === 403) { setLocked(true); setDataLoading(false); return; }

      if (brandsRes.ok) {
        const brandsData = await brandsRes.json();
        setBrands(Array.isArray(brandsData) ? brandsData : brandsData.brands || []);
      }

      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        setResults(Array.isArray(resultsData) ? resultsData : []);
      } else {
        throw new Error("获取审计结果失败");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "加载数据失败");
    } finally {
      if (!controller.signal.aborted) setDataLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [currentProjectId]);

  // Brand column order: primary brands first, then competitors
  const brandColumns = useMemo(() => {
    const primary = brands.filter((b) => !b.is_competitor).map((b) => b.name);
    const competitors = brands.filter((b) => b.is_competitor).map((b) => b.name);
    return [...primary, ...competitors];
  }, [brands]);

  const primaryBrand = useMemo(
    () => brands.find((b) => !b.is_competitor)?.name,
    [brands]
  );

  // Filtered results
  const filteredResults = useMemo(() => {
    let list = results;
    if (filterPlatform !== "all") {
      list = list.filter((r) => r.platform === filterPlatform);
    }
    if (filterMentionOnly) {
      list = list.filter((r) => r.mention_found);
    }
    return list;
  }, [results, filterPlatform, filterMentionOnly]);

  const mentionCount = useMemo(() => {
    const base = filterPlatform === "all" ? results : results.filter((r) => r.platform === filterPlatform);
    return base.filter((r) => r.mention_found).length;
  }, [results, filterPlatform]);

  // Grouped pivot table
  const groupedResults = useMemo(() => {
    const groupMap = new Map<string, Map<string, QueryResult[]>>();
    for (const r of filteredResults) {
      if (!r.brand_name) continue;
      const pKey = r.platform;
      const qKey = r.prompt_text || "";
      if (!groupMap.has(pKey)) groupMap.set(pKey, new Map());
      const promptMap = groupMap.get(pKey)!;
      if (!promptMap.has(qKey)) promptMap.set(qKey, []);
      promptMap.get(qKey)!.push(r);
    }

    const rows: GroupedRow[] = [];
    for (const [platform, promptMap] of groupMap) {
      for (const [promptText, resultList] of promptMap) {
        const brandResults: Record<string, QueryResult | undefined> = {};
        for (const r of resultList) {
          brandResults[r.brand_name!] = r;
        }
        let gap = 0;
        const primaryResult = primaryBrand ? brandResults[primaryBrand] : undefined;
        if (!primaryResult || !primaryResult.mention_found) {
          gap = 100;
        } else {
          for (const [brand, r] of Object.entries(brandResults)) {
            if (brand === primaryBrand || !r) continue;
            if (
              r.mention_found &&
              r.recommendation_rank != null &&
              primaryResult.recommendation_rank != null
            ) {
              if (r.recommendation_rank < primaryResult.recommendation_rank) gap++;
            }
          }
        }
        rows.push({ platform, promptText, brandResults, mentionGap: gap });
      }
    }

    rows.sort((a, b) => {
      const pComp = a.platform.localeCompare(b.platform);
      if (pComp !== 0) return pComp;
      return b.mentionGap - a.mentionGap;
    });

    return rows;
  }, [filteredResults, primaryBrand]);

  // Radar chart data
  const radarData = useMemo(() => {
    const platforms = platformKeys;
    const brandData: Record<string, Record<string, number>> = {};
    const platformTotals: Record<string, number> = {};

    for (const r of results) {
      platformTotals[r.platform] = (platformTotals[r.platform] || 0) + 1;
      if (!r.brand_name || !r.mention_found) continue;
      if (!brandData[r.brand_name]) brandData[r.brand_name] = {};
      brandData[r.brand_name][r.platform] = (brandData[r.brand_name][r.platform] || 0) + 1;
    }

    return platforms.map((p) => {
      const entry: Record<string, string | number> = { platform: platformNames[p] || p };
      for (const brand of brandColumns) {
        const mentions = brandData[brand]?.[p] || 0;
        const total = platformTotals[p] || 1;
        entry[brand] = Math.round((mentions / total) * 100);
      }
      return entry;
    });
  }, [results, brandColumns]);

  // Bar chart data
  const barData = useMemo(() => {
    const brandMentions: Record<string, number> = {};
    const brandTotals: Record<string, number> = {};
    for (const r of results) {
      if (!r.brand_name) continue;
      brandTotals[r.brand_name] = (brandTotals[r.brand_name] || 0) + 1;
      if (r.mention_found) {
        brandMentions[r.brand_name] = (brandMentions[r.brand_name] || 0) + 1;
      }
    }
    return brandColumns
      .map((brand) => ({
        brand,
        rate: brandTotals[brand] ? Math.round(((brandMentions[brand] || 0) / brandTotals[brand]) * 100) : 0,
        isPrimary: brands.find((b) => b.name === brand && !b.is_competitor) != null,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [results, brandColumns, brands]);

  // No project selected
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      {
        id: "project",
        label: "创建项目",
        status: projects.length === 0 ? "incomplete" : "complete",
        actionLabel: "创建",
        onAction: () => openWizard(),
      },
      {
        id: "product",
        label: "完善产品信息",
        status: currentProject?.productName ? "complete" : "incomplete",
      },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比你与竞品在AI平台的可见性表现" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比你与竞品在AI平台的可见性表现" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-72 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
        <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比你与竞品在AI平台的可见性表现" />
        <div style={sectionCard}>
          <EmptyState icon={GitCompare} title="需要升级" description="竞品对比功能需要订阅智见专业版" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比你与竞品在AI平台的可见性表现" />
        <div style={sectionCard}>
          <EmptyState
            icon={GitCompare}
            title="加载失败"
            description={error}
            actionLabel="重试"
            onAction={loadData}
          />
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="竞品对比" subtitle="对比你与竞品在AI平台的可见性表现" />
        <div style={sectionCard}>
          <EmptyState
            icon={GitCompare}
            title="暂无竞品对比数据"
            description="完成首次审计后，此处将展示多维度竞品分析"
            actionLabel="前往审计列表"
            actionHref="/visibility"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="竞品对比"
        subtitle="对比你与竞品在AI平台的可见性表现"
        actions={
          <button
            onClick={loadData}
            disabled={dataLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: dataLoading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            <RefreshCw size={14} className={dataLoading ? "animate-spin" : ""} />
            刷新
          </button>
        }
      />

      {/* Charts row */}
      <CompareCharts radarData={radarData} barData={barData} brandColumns={brandColumns} />

      {/* Detail pivot table */}
      <div style={sectionCard}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            详细对比 <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>{groupedResults.length} 组查询</span>
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              <button
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                onClick={() => setFilterPlatform("all")}
                style={{
                  background: filterPlatform === "all" ? "var(--color-primary-dim)" : "transparent",
                  border: filterPlatform === "all" ? "1px solid var(--color-primary)" : "1px solid var(--border)",
                  color: filterPlatform === "all" ? "var(--color-primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                全部
              </button>
              {platformKeys.map((p) => (
                <button
                  key={p}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  onClick={() => setFilterPlatform(p)}
                  style={{
                    background: filterPlatform === p ? "var(--color-primary-dim)" : "transparent",
                    border: filterPlatform === p ? "1px solid var(--color-primary)" : "1px solid var(--border)",
                    color: filterPlatform === p ? "var(--color-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {platformNames[p]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={filterMentionOnly}
                onChange={(e) => setFilterMentionOnly(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              <span>仅看提及</span>
              <span
                className="px-1.5 rounded-full text-[10px] font-semibold"
                style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
              >
                {mentionCount}
              </span>
            </label>
          </div>
        </div>

        {/* Legend */}
        <div
          className="flex gap-4 flex-wrap mb-3 px-3 py-2 rounded-md text-xs"
          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
        >
          <span><span style={{ color: "var(--color-success)" }}>✓</span> 被提及</span>
          <span>#N 推荐排名</span>
          <span>N% 情感置信度</span>
          <span style={{ color: "var(--text-muted)" }}>— 未提及</span>
        </div>

        {/* Table */}
        <div
          className="overflow-auto rounded-md"
          style={{ maxHeight: 520, border: "1px solid var(--border)" }}
        >
          <table className="w-full border-collapse" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--bg-card)" }}>
                <th
                  className="text-left px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)", width: 100 }}
                >
                  平台
                </th>
                <th
                  className="text-left px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)", minWidth: 180 }}
                >
                  Prompt
                </th>
                {brandColumns.map((brand) => {
                  const isPrimary = brands.find((b) => b.name === brand && !b.is_competitor);
                  return (
                    <th
                      key={brand}
                      className="text-center px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider"
                      style={{
                        color: isPrimary ? "var(--color-primary)" : "var(--text-muted)",
                        borderBottom: "1px solid var(--border)",
                        minWidth: 90,
                        background: isPrimary ? "var(--color-primary-dim)" : undefined,
                      }}
                    >
                      {brand}
                      {isPrimary && (
                        <span className="font-normal text-[9px]" style={{ color: "var(--color-primary)" }}>（你）</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groupedResults.map((row, idx) => (
                <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    {platformNames[row.platform] || row.platform}
                  </td>
                  <td
                    className="px-3 py-2 max-w-[260px] truncate"
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}
                    title={row.promptText}
                  >
                    {row.promptText || "—"}
                  </td>
                  {brandColumns.map((brand) => {
                    const result = row.brandResults[brand];
                    const isPrimary = brands.find((b) => b.name === brand && !b.is_competitor);
                    const cellBg = result?.mention_found
                      ? "rgba(0, 212, 170, 0.04)"
                      : result && !result.mention_found && Object.values(row.brandResults).some((r) => r?.mention_found)
                        ? "rgba(239, 68, 68, 0.03)"
                        : undefined;

                    return (
                      <td
                        key={brand}
                        className="text-center px-3 py-2 whitespace-nowrap"
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isPrimary ? "var(--color-primary-dim)" : cellBg,
                        }}
                      >
                        {result?.mention_found ? (
                          <>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(0,212,170,0.12)", color: "var(--color-success)" }}>✓</span>
                            {result.recommendation_rank && (
                              <span className="text-[10px] font-semibold ml-1" style={{ color: "#4cc9f0" }}>
                                #{result.recommendation_rank}
                              </span>
                            )}
                            {result.mention_confidence != null && (
                              <span className="text-[10px] ml-1" style={{ color: "var(--text-secondary)" }}>
                                {(result.mention_confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </>
                        ) : result ? (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {groupedResults.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + brandColumns.length}
                    className="text-center py-8"
                    style={{ color: "var(--text-muted)" }}
                  >
                    无匹配结果，试试调整筛选条件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
