"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronDown,
  FileText,
  Globe2,
  Lightbulb,
  Loader2,
  Download,
  RefreshCw,
  ScanSearch,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { sectionCard } from "@/components/charts/shared";
import { AiPlatformLabel, AiPlatformList } from "@/components/ui/ai-platform-label";
import { buildProductWebsiteTechnicalFileDrafts } from "@/lib/product-website/technical-file-drafts";
import type {
  ProductWebsiteAnalysis,
  ProductWebsiteAnalysisStatus,
  ProductWebsiteRecommendation,
  ProductWebsiteScore,
  ProductWebsiteTrendPoint,
  ProductWebsiteTrends,
} from "@/types/product-website";

interface ProductWebsiteAnalysisPanelProps {
  projectId: string;
  productUrl?: string | null;
  projectUrl?: string | null;
}

const TERMINAL_STATUSES: ProductWebsiteAnalysisStatus[] = ["completed", "partial", "failed"];

const ANALYSIS_VIEWS = [
  { key: "details", label: "详细内容", icon: ChartNoAxesColumnIncreasing },
  { key: "diagnostics", label: "维度诊断", icon: ScanSearch },
  { key: "recommendations", label: "优化建议", icon: Lightbulb },
] as const;

const DIMENSION_LABELS: Record<string, string> = {
  aiCitability: "AI 可引用性",
  brandAuthority: "品牌权威性",
  eeat: "内容 E-E-A-T",
  technicalGeo: "技术 GEO",
  schemaStructuredData: "架构与结构化数据",
  platformOptimization: "平台优化",
  structure: "页面结构",
  semantic: "语义覆盖",
  density: "实体密度",
  authority: "权威信号",
  technical: "技术可读",
  readability: "内容可读",
  productClarity: "产品清晰度",
  aiCitationReadiness: "AI 引用准备度",
};

function scoreColor(score: number | null | undefined) {
  if (score == null) return "var(--text-muted)";
  if (score >= 80) return "var(--color-success)";
  if (score >= 60) return "var(--color-primary)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function priorityColor(priority: ProductWebsiteRecommendation["priority"]) {
  if (priority === "high") return "var(--color-error)";
  if (priority === "medium") return "var(--color-warning)";
  return "var(--color-primary)";
}

function priorityText(priority?: ProductWebsiteRecommendation["priority"]) {
  if (priority === "high") return "高优先级";
  if (priority === "medium") return "中优先级";
  if (priority === "low") return "低优先级";
  return "待评估";
}

function effortText(effort?: string) {
  if (effort === "small") return "小工作量";
  if (effort === "medium") return "中工作量";
  if (effort === "large") return "大工作量";
  return effort || "--";
}

function impactText(impact?: string) {
  if (impact === "high") return "高影响";
  if (impact === "medium") return "中影响";
  if (impact === "low") return "低影响";
  return impact || "--";
}

function diagnosticStatusText(status?: string, score?: number) {
  if (status === "strong") return "表现良好";
  if (status === "weak") return "优先改进";
  if ((score ?? 0) >= 80) return "表现良好";
  if ((score ?? 100) < 60) return "优先改进";
  return "需要关注";
}

function statusText(status?: ProductWebsiteAnalysisStatus | null, stage?: string | null) {
  if (status === "completed") return "分析完成";
  if (status === "partial") return "部分完成";
  if (status === "failed") return "分析失败";
  if (status === "fetching") return "抓取页面中";
  if (status === "extracting") return "解析页面中";
  if (status === "queued") return "等待执行";
  return stage || "分析中";
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function latestPoint(points: ProductWebsiteTrendPoint[]) {
  return [...points].reverse().find((point) => point.analysisId);
}

export function ProductWebsiteAnalysisPanel({
  projectId,
  productUrl,
  projectUrl,
}: ProductWebsiteAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<ProductWebsiteAnalysis | null>(null);
  const [trends, setTrends] = useState<ProductWebsiteTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"details" | "diagnostics" | "recommendations">("details");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const targetUrl = productUrl || projectUrl || "";
  const snapshot = analysis?.result_snapshot;
  const score = snapshot?.score;
  const overall = analysis?.score_overall ?? score?.overall ?? trends?.summary.currentScore ?? null;
  const dimensions = score?.dimensions ?? latestPoint(trends?.points ?? [])?.dimensions ?? {};
  const recommendations = snapshot?.recommendations ?? [];
  const contentDetail = snapshot?.contentDetail;
  const dimensionDiagnostics = snapshot?.dimensionDiagnostics ?? {};
  const aiCitations = snapshot?.aiCitations;
  const technicalAudit = snapshot?.technicalAudit ?? snapshot?.geoAudit?.technicalAudit;
  const eeatSignals = snapshot?.geoAudit?.eeatSignals;
  const schemaQuality = snapshot?.geoAudit?.schemaQuality;
  const platformPresence = snapshot?.geoAudit?.platformPresence;
  const coveredAiPlatforms = (platformPresence?.models || [])
    .map((item) => item.id || item.label)
    .filter((platform): platform is string => Boolean(platform));
  const isRunning = !!analysis && !TERMINAL_STATUSES.includes(analysis.status);
  const diagnosticRows = useMemo(
    () => Object.entries(dimensionDiagnostics).sort(([, left], [, right]) => (left.score ?? 101) - (right.score ?? 101)),
    [dimensionDiagnostics],
  );
  const recommendationGroups = useMemo(() => ([
    { key: "high", label: "优先处理", items: recommendations.filter((item) => item.priority === "high") },
    { key: "medium", label: "计划改进", items: recommendations.filter((item) => item.priority === "medium" || !item.priority) },
    { key: "low", label: "持续优化", items: recommendations.filter((item) => item.priority === "low") },
  ]).filter((group) => group.items.length > 0), [recommendations]);
  const technicalFileDrafts = useMemo(() => buildProductWebsiteTechnicalFileDrafts({
    targetUrl: contentDetail?.metadata?.finalUrl || snapshot?.page?.finalUrl || targetUrl,
    title: contentDetail?.metadata?.title || snapshot?.page?.title,
    description: contentDetail?.metadata?.description || snapshot?.page?.metaDescription || snapshot?.page?.description,
    canonical: contentDetail?.metadata?.canonical || snapshot?.page?.canonical,
    technicalAudit,
  }), [contentDetail, snapshot?.page, targetUrl, technicalAudit]);

  const downloadTechnicalFile = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }, []);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchAnalysis = useCallback(async (analysisId: number) => {
    const res = await fetch(
      `/api/integration/product-website/${analysisId}?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error("产品网站分析结果加载失败");
    }
    const data = (await res.json()) as ProductWebsiteAnalysis;
    setAnalysis(data);
    return data;
  }, [projectId]);

  const refreshTrends = useCallback(async () => {
    const res = await fetch(
      `/api/integration/product-website/trends?projectId=${encodeURIComponent(projectId)}&range=30d`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error("产品网站趋势加载失败");
    }
    const data = (await res.json()) as ProductWebsiteTrends;
    setTrends(data);
    const latest = latestPoint(data.points);
    if (latest?.analysisId) {
      await fetchAnalysis(latest.analysisId);
    } else {
      setAnalysis(null);
    }
  }, [fetchAnalysis, projectId]);

  const pollAnalysis = useCallback((analysisId: number) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchAnalysis(analysisId);
        if (TERMINAL_STATUSES.includes(data.status)) {
          clearPoll();
          void refreshTrends();
        }
      } catch (err) {
        clearPoll();
        setError(err instanceof Error ? err.message : "产品网站分析状态更新失败");
      }
    }, 2500);
  }, [clearPoll, fetchAnalysis, refreshTrends]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshTrends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "产品网站分析加载失败");
    } finally {
      setLoading(false);
    }
  }, [refreshTrends]);

  useEffect(() => {
    clearPoll();
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timeout);
      clearPoll();
    };
  }, [clearPoll, load, projectId]);

  const startAnalysis = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/integration/product-website/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          enableAiCitation: true,
          crawlerProvider: "firecrawl",
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "产品网站分析启动失败");
      }
      const created = (await res.json()) as { analysisId?: number; id?: number };
      const analysisId = created.analysisId ?? created.id;
      if (!analysisId) throw new Error("产品网站分析任务缺少 ID");
      const data = await fetchAnalysis(analysisId);
      if (!TERMINAL_STATUSES.includes(data.status)) {
        pollAnalysis(analysisId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "产品网站分析启动失败");
    } finally {
      setStarting(false);
    }
  }, [fetchAnalysis, pollAnalysis, projectId]);

  const dimensionRows = useMemo(() => {
    return Object.entries(dimensions)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => ({
        key,
        label: DIMENSION_LABELS[key as keyof ProductWebsiteScore["dimensions"]] ?? key,
        value: value as number,
      }));
  }, [dimensions]);

  const trendPoints = trends?.points.filter((point) => typeof point.overall === "number").slice(-8) ?? [];
  const maxTrendScore = Math.max(100, ...trendPoints.map((point) => Number(point.overall) || 0));

  return (
    <section style={sectionCard}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              产品网站可见性
            </h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            从网站结构、产品语义、AI 可引用性和内容可信度评估产品页基础表现。
          </p>
          {targetUrl && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs"
              style={{ color: "var(--text-muted)", textDecoration: "none" }}
            >
              {targetUrl}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || starting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            title="刷新"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "var(--bg-elevated)",
              cursor: loading || starting ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {analysis && TERMINAL_STATUSES.includes(analysis.status) && (
            <a
              href={`/api/integration/product-website/${analysis.id}/pdf?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md"
              title="导出报告"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                textDecoration: "none",
              }}
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={startAnalysis}
            disabled={starting || isRunning}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            style={{
              border: "none",
              background: "var(--color-primary)",
              color: "#0b0d14",
              cursor: starting || isRunning ? "not-allowed" : "pointer",
            }}
          >
            {starting || isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analysis ? "重新分析" : "开始分析"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--color-error)15", color: "var(--color-error)" }}
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <div
            className="flex h-full min-h-36 flex-col justify-center rounded-md px-4 py-4"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>综合得分</span>
            <div className="mt-2 flex items-end gap-2">
              <span
                className="font-bold"
                style={{ color: scoreColor(overall), fontSize: 44, lineHeight: 1, fontFamily: "var(--font-mono)" }}
              >
                {overall ?? "--"}
              </span>
              <span className="pb-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {analysis?.score_grade ?? score?.grade ?? ""}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {loading ? "加载中" : statusText(analysis?.status, analysis?.stage)}
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              最近更新：{formatDate(analysis?.completed_at ?? analysis?.updated_at)}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-md px-4 py-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              <TrendingUp className="h-4 w-4" />
              近 30 天趋势
            </div>
            {trendPoints.length > 0 ? (
              <div className="flex h-28 items-end gap-2">
                {trendPoints.map((point) => {
                  const height = `${Math.max(8, ((Number(point.overall) || 0) / maxTrendScore) * 100)}%`;
                  return (
                    <div key={point.analysisId} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-medium" style={{ color: scoreColor(point.overall) }}>
                        {point.overall}
                      </span>
                      <div className="flex h-20 w-full items-end">
                        <div
                          className="w-full rounded-t transition-[height]"
                          title={`${formatDate(point.date)}: ${point.overall}`}
                          style={{ height, background: scoreColor(point.overall), opacity: 0.85 }}
                        />
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(point.date))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-24 items-center text-sm" style={{ color: "var(--text-muted)" }}>
                暂无历史趋势，完成首次分析后开始沉淀。
              </div>
            )}
            {typeof trends?.summary.delta === "number" && (
              <div className="mt-3 text-xs" style={{ color: scoreColor((trends.summary.delta ?? 0) >= 0 ? 80 : 30) }}>
                较上次 {trends.summary.delta >= 0 ? "+" : ""}{trends.summary.delta}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="rounded-md px-4 py-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              <FileText className="h-4 w-4" />
              页面摘要
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt style={{ color: "var(--text-muted)" }}>标题</dt>
                <dd className="truncate" style={{ color: "var(--text-primary)" }}>{snapshot?.page?.title || "--"}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>正文词数</dt>
                <dd style={{ color: "var(--text-primary)" }}>{snapshot?.page?.wordCount ?? "--"}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>H1 数量</dt>
                <dd style={{ color: "var(--text-primary)" }}>{snapshot?.page?.h1?.length ?? "--"}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>结构化数据</dt>
                <dd className="truncate" style={{ color: "var(--text-primary)" }}>
                  {snapshot?.page?.schemaTypes?.length ? snapshot.page.schemaTypes.join(", ") : "--"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {dimensionRows.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {dimensionRows.map((item) => (
            <div key={item.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                <span style={{ color: scoreColor(item.value), fontFamily: "var(--font-mono)" }}>{item.value}</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "var(--bg-hover)" }}>
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, item.value))}%`, background: scoreColor(item.value) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {(contentDetail || Object.keys(dimensionDiagnostics).length > 0 || recommendations.length > 0) && (
        <div className="mt-5">
          <div
            className="mb-4 inline-flex rounded-md p-1"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            {ANALYSIS_VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveView(key as "details" | "diagnostics" | "recommendations")}
                aria-pressed={activeView === key}
                className="group inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  background: activeView === key ? "var(--color-primary)" : "transparent",
                  color: activeView === key ? "#0b0d14" : "var(--text-secondary)",
                }}
              >
                <Icon
                  className={`h-3.5 w-3.5 transition-transform transition-colors group-hover:scale-110 ${
                    activeView === key ? "" : "text-[var(--text-muted)] group-hover:text-[var(--color-primary)]"
                  }`}
                />
                {label}
              </button>
            ))}
          </div>

          {activeView === "details" && (
            <>
              <div className="mb-3 flex flex-col gap-3 rounded-md px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>页面信号总览</h3>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>先看基础抓取与技术状态，再向下查看结构化数据、平台覆盖和正文证据。</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded px-2 py-1" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>正文 {snapshot?.page?.wordCount ?? "--"} 词</span>
                  <span className="rounded px-2 py-1" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>Schema {snapshot?.page?.schemaTypes?.length ?? 0} 类</span>
                  <span className="rounded px-2 py-1" style={{ background: "var(--bg-hover)", color: scoreColor(technicalAudit?.score?.overall) }}>技术 GEO {technicalAudit?.score?.overall ?? "--"}</span>
                </div>
              </div>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>01 · 页面基础与机器可读性</div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="rounded-md px-4 py-4 lg:col-span-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>页面机器可读信号</div>
                <dl className="space-y-3 text-sm">
                  {[
                    ["最终 URL", contentDetail?.metadata?.finalUrl || snapshot?.page?.finalUrl || targetUrl],
                    ["Canonical", contentDetail?.metadata?.canonical || snapshot?.page?.canonical || "--"],
                    ["语言", contentDetail?.metadata?.lang || snapshot?.page?.lang || "--"],
                    ["Viewport", contentDetail?.metadata?.viewport || "--"],
                    ["Schema", (contentDetail?.schema?.jsonLdTypes || snapshot?.page?.schemaTypes || []).join(", ") || "--"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</dt>
                      <dd className="break-words" style={{ color: "var(--text-primary)" }}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-md px-4 py-4 lg:col-span-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>标题与关键词</div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>H1</div>
                    <div style={{ color: "var(--text-primary)" }}>{(contentDetail?.headings?.h1 || snapshot?.page?.h1 || []).join(" / ") || "--"}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>H2 样本</div>
                    <ul className="mt-1 space-y-1">
                      {(contentDetail?.headings?.h2 || snapshot?.page?.h2 || []).slice(0, 6).map((item, index) => (
                        <li key={`${item}-${index}`} style={{ color: "var(--text-secondary)" }}>{item}</li>
                      ))}
                      {!(contentDetail?.headings?.h2 || snapshot?.page?.h2 || []).length && <li style={{ color: "var(--text-muted)" }}>--</li>}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>关键词覆盖</div>
                    <div style={{ color: "var(--text-primary)" }}>
                      {contentDetail?.keywordCoverage?.matched ?? 0}/{contentDetail?.keywordCoverage?.total ?? 0}
                      {typeof contentDetail?.keywordCoverage?.coverageRate === "number" ? ` (${contentDetail.keywordCoverage.coverageRate}%)` : ""}
                    </div>
                    {!!contentDetail?.keywordCoverage?.missing?.length && (
                      <div className="mt-1 text-xs" style={{ color: "var(--color-warning)" }}>
                        缺失：{contentDetail.keywordCoverage.missing.join("、")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md px-4 py-4 lg:col-span-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>链接、图片与抓取</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs" style={{ color: "var(--text-muted)" }}>内部链接</div><div style={{ color: "var(--text-primary)" }}>{contentDetail?.links?.internalCount ?? snapshot?.page?.links?.internal ?? "--"}</div></div>
                  <div><div className="text-xs" style={{ color: "var(--text-muted)" }}>外部链接</div><div style={{ color: "var(--text-primary)" }}>{contentDetail?.links?.externalCount ?? snapshot?.page?.links?.external ?? "--"}</div></div>
                  <div><div className="text-xs" style={{ color: "var(--text-muted)" }}>图片缺失 alt</div><div style={{ color: "var(--text-primary)" }}>{contentDetail?.images?.missingAlt ?? snapshot?.page?.imagesMissingAlt ?? "--"}/{contentDetail?.images?.total ?? snapshot?.page?.imageCount ?? "--"}</div></div>
                  <div><div className="text-xs" style={{ color: "var(--text-muted)" }}>抓取耗时</div><div style={{ color: "var(--text-primary)" }}>{contentDetail?.crawl?.durationMs ?? "--"} ms</div></div>
                </div>
              </div>

              {(technicalAudit || schemaQuality || platformPresence) && (
                <div className="mt-2 lg:col-span-12">
                  <div className="text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>02 · 技术 GEO、实体与平台覆盖</div>
                </div>
              )}

              {technicalAudit && (
                <div className="rounded-md px-4 py-4 lg:col-span-12" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>技术 GEO 子流程</div>
                    <div className="font-mono text-sm" style={{ color: scoreColor(technicalAudit.score?.overall) }}>{technicalAudit.score?.overall ?? "--"}/100</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>robots.txt</div>
                      <div style={{ color: "var(--text-primary)" }}>{technicalAudit.robots?.found ? "已发现" : "未发现"}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>国内爬虫访问</div>
                      <div style={{ color: scoreColor(technicalAudit.robots?.domesticScore) }}>{technicalAudit.robots?.domesticScore ?? "--"}/100</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>llms.txt</div>
                      <div style={{ color: scoreColor(technicalAudit.llms?.scores?.overall) }}>{technicalAudit.llms?.found ? `${technicalAudit.llms.scores?.overall ?? "--"}/100` : "未发现"}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>llms-full.txt</div>
                      <div style={{ color: "var(--text-primary)" }}>{technicalAudit.llmsFull?.found ? "已发现" : "未发现"}</div>
                    </div>
                  </div>
                  {!!technicalAudit.robots?.blockedCritical?.length && (
                    <div className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-hover)", color: "var(--color-warning)" }}>
                      被阻止的国内关键爬虫：{technicalAudit.robots.blockedCritical.map((item) => item.name || item.id).filter(Boolean).join("、")}
                    </div>
                  )}
                </div>
              )}

              {schemaQuality && (
                <div className="rounded-md px-4 py-4 lg:col-span-12" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Schema 实体图</div>
                    <div className="font-mono text-sm" style={{ color: scoreColor(schemaQuality.propertyScore) }}>{schemaQuality.propertyScore ?? "--"}/100</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-md px-3 py-3" style={{ background: "var(--bg-hover)" }}>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>推荐 / 已检测</div>
                      <div className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
                        {(schemaQuality.found || []).length}/{(schemaQuality.recommended || []).length}
                      </div>
                      {!!schemaQuality.missing?.length && (
                        <div className="mt-2 text-xs leading-5" style={{ color: "var(--color-warning)" }}>
                          缺失：{schemaQuality.missing.join("、")}
                        </div>
                      )}
                    </div>
                    <div className="rounded-md px-3 py-3" style={{ background: "var(--bg-hover)" }}>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>sameAs 实体关系</div>
                      <div className="mt-1 font-mono text-sm" style={{ color: scoreColor(schemaQuality.sameAs?.score) }}>{schemaQuality.sameAs?.score ?? "--"}/100</div>
                      <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        国内平台 URL：{schemaQuality.sameAs?.domesticUrls?.length ?? 0}
                      </div>
                    </div>
                    <div className="rounded-md px-3 py-3" style={{ background: "var(--bg-hover)" }}>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>修复示例</div>
                      <ul className="mt-1 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {(schemaQuality.examples || []).slice(0, 3).map((item, index) => (
                          <li key={`${item.type}-${index}`}>{item.type || "Schema"} JSON-LD</li>
                        ))}
                        {!schemaQuality.examples?.length && <li>暂无缺失示例</li>}
                      </ul>
                    </div>
                  </div>
                  {!!schemaQuality.propertyCompleteness?.length && (
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {schemaQuality.propertyCompleteness.filter((item) => item.found).slice(0, 4).map((item) => (
                        <div key={item.type} className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                          <span style={{ color: scoreColor(item.score), fontFamily: "var(--font-mono)" }}>{item.score ?? "--"}</span>
                          <span> · {item.type} 缺失 {item.missing?.join("、") || "暂无"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {platformPresence && (
                <div className="rounded-md px-4 py-4 lg:col-span-12" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>已接入模型平台覆盖</div>
                      <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {coveredAiPlatforms.length > 0
                          ? <AiPlatformList platforms={coveredAiPlatforms} iconSize={15} />
                          : "--"}
                      </div>
                    </div>
                    <div className="font-mono text-sm" style={{ color: scoreColor(platformPresence.score) }}>{platformPresence.score ?? "--"}/100</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
                    {(platformPresence.platforms || []).map((item) => (
                      <div key={item.id} className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-hover)" }}>
                        <div style={{ color: item.found ? "var(--color-success)" : "var(--text-muted)" }}>{item.found ? "已发现" : "缺失"}</div>
                        <div className="mt-1" style={{ color: "var(--text-primary)" }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {!!platformPresence.modelAdvice?.some((item) => item.missingPlatforms?.length) && (
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {platformPresence.modelAdvice.filter((item) => item.missingPlatforms?.length).slice(0, 4).map((item) => (
                        <div key={item.model} className="rounded-md px-3 py-2 text-xs leading-5" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                          <div className="flex items-center gap-2">
                            <span style={{ color: scoreColor(item.score), fontFamily: "var(--font-mono)" }}>{item.score ?? "--"}</span>
                            {(item.model || item.label) && <AiPlatformLabel platform={item.model || item.label || ""} iconSize={15} />}
                          </div>
                          <div className="mt-1">{item.advice}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 lg:col-span-12">
                <div className="text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>03 · 内容质量与正文证据</div>
              </div>

              {eeatSignals && (
                <div className="rounded-md px-4 py-4 lg:col-span-12" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>E-E-A-T 内容证据</div>
                    <div className="font-mono text-sm" style={{ color: scoreColor(eeatSignals.overall) }}>{eeatSignals.overall ?? "--"}/100</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["experience", "经验"],
                      ["expertise", "专业性"],
                      ["authoritativeness", "权威性"],
                      ["trustworthiness", "可信度"],
                    ].map(([key, label]) => {
                      const value = eeatSignals.subScores?.[key as keyof NonNullable<typeof eeatSignals.subScores>];
                      const evidence = eeatSignals.evidence?.[key] || [];
                      const gaps = eeatSignals.gaps?.[key] || [];
                      return (
                        <div key={key} className="rounded-md px-3 py-3" style={{ background: "var(--bg-hover)" }}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
                            <div className="font-mono text-sm" style={{ color: scoreColor(value) }}>{value ?? "--"}</div>
                          </div>
                          <ul className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                            {evidence.slice(0, 3).map((item, index) => <li key={index}>{item}</li>)}
                            {!evidence.length && <li>暂无证据</li>}
                          </ul>
                          {!!gaps.length && (
                            <div className="mt-2 text-xs leading-5" style={{ color: "var(--color-warning)" }}>{gaps[0]}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-md px-4 py-4 lg:col-span-12" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>正文样本</div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {(contentDetail?.paragraphs || []).slice(0, 6).map((item, index) => (
                    <div key={index} className="rounded-md px-3 py-3" style={{ background: "var(--bg-hover)" }}>
                      <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>样本 {index + 1} · {item.wordCount ?? "--"} 词</div>
                      <p className="line-clamp-4 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.text}</p>
                    </div>
                  ))}
                  {!(contentDetail?.paragraphs || []).length && (
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>暂无正文样本</div>
                  )}
                </div>
              </div>
              </div>
            </>
          )}

          {activeView === "diagnostics" && (
            <div>
              {!!diagnosticRows.length && (
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    ["优先改进", diagnosticRows.filter(([, item]) => diagnosticStatusText(item.status, item.score) === "优先改进").length, "var(--color-error)"],
                    ["需要关注", diagnosticRows.filter(([, item]) => diagnosticStatusText(item.status, item.score) === "需要关注").length, "var(--color-warning)"],
                    ["表现良好", diagnosticRows.filter(([, item]) => diagnosticStatusText(item.status, item.score) === "表现良好").length, "var(--color-success)"],
                  ].map(([label, value, color]) => (
                    <div key={label as string} className="rounded-md px-3 py-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <div className="font-mono text-lg" style={{ color: color as string }}>{value as number}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label as string}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {diagnosticRows.map(([key, item], index) => (
                  <details key={key} open={index === 0} className="group rounded-md" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{String(index + 1).padStart(2, "0")}</span>
                          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label || DIMENSION_LABELS[key as keyof ProductWebsiteScore["dimensions"]] || key}</h3>
                          <span className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--bg-hover)", color: scoreColor(item.score) }}>{diagnosticStatusText(item.status, item.score)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.summary || "展开查看该维度的证据、问题与机会。"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-base" style={{ color: scoreColor(item.score) }}>{item.score ?? "--"}</span>
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" style={{ color: "var(--text-muted)" }} />
                      </div>
                    </summary>
                    <div className="grid grid-cols-1 gap-4 border-t px-4 py-4 md:grid-cols-3" style={{ borderColor: "var(--border)" }}>
                      {[
                        ["分析证据", item.evidence || []],
                        ["发现问题", item.issues?.length ? item.issues : ["暂无明显问题"]],
                        ["优化机会", item.opportunities || []],
                      ].map(([label, values]) => (
                        <div key={label as string}>
                          <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label as string}</div>
                          <ul className="space-y-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                            {(values as string[]).map((text, valueIndex) => <li key={valueIndex} className="border-l-2 pl-2" style={{ borderColor: "var(--border)" }}>{text}</li>)}
                            {!(values as string[]).length && <li>暂无信息</li>}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              {!diagnosticRows.length && (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>暂无维度诊断</div>
              )}
            </div>
          )}

          {activeView === "recommendations" && (
            <div className="space-y-5">
              {!!technicalFileDrafts.length && (
                <section className="rounded-md px-4 py-4" style={{ background: "color-mix(in srgb, var(--color-primary) 8%, var(--bg-elevated))", border: "1px solid color-mix(in srgb, var(--color-primary) 35%, var(--border))" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>技术文件修复包</h3>
                    <span className="rounded px-2 py-0.5 font-mono text-xs" style={{ background: "var(--bg-hover)", color: "var(--color-primary)" }}>{technicalFileDrafts.length}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-xs leading-5" style={{ color: "var(--text-secondary)" }}>已为缺失文件生成草稿。下载后请核对 TODO、链接和抓取策略，再发布到网站根目录；系统不会自动改动客户网站。</p>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {technicalFileDrafts.map((draft) => (
                      <div key={draft.id} className="flex flex-col rounded-md px-3 py-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <div className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{draft.label}</div>
                        <p className="mt-2 flex-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{draft.description}</p>
                        <button type="button" onClick={() => downloadTechnicalFile(draft.filename, draft.content)} aria-label={`下载 ${draft.filename} 草稿`} className="mt-3 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)] hover:text-[#0b0d14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" style={{ background: "var(--bg-hover)", color: "var(--color-primary)" }}>
                          <Download className="h-3.5 w-3.5" />下载草稿
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["high", "medium", "low"] as const).map((priority) => (
                  <div key={priority} className="rounded-md px-3 py-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    <div className="font-mono text-lg" style={{ color: priorityColor(priority) }}>{recommendations.filter((item) => item.priority === priority || (priority === "medium" && !item.priority)).length}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{priorityText(priority)}</div>
                  </div>
                ))}
              </div>

              {recommendationGroups.map((group) => (
                <section key={group.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: priorityColor(group.key as ProductWebsiteRecommendation["priority"]) }} />
                    <h3 className="text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{group.label} · {group.items.length}</h3>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item, index) => (
                      <details key={item.id || `${item.title}-${index}`} open={group.key === "high" && index === 0} className="group rounded-md" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</h4>
                            <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.problem || item.detail || "展开查看执行建议。"}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                            {[item.dimensionLabel || item.dimension, impactText(item.impact), effortText(item.effort), typeof item.expectedLift === "number" ? `预期 +${item.expectedLift}` : null].filter(Boolean).map((tag) => <span key={tag} className="rounded px-2 py-1" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{tag}</span>)}
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" style={{ color: "var(--text-muted)" }} />
                          </div>
                        </summary>
                        <div className="grid grid-cols-1 gap-5 border-t px-4 py-4 lg:grid-cols-3" style={{ borderColor: "var(--border)" }}>
                          <div><div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>为什么要做</div><ul className="space-y-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{(item.evidence || []).map((text, itemIndex) => <li key={itemIndex} className="border-l-2 pl-2" style={{ borderColor: "var(--border)" }}>{text}</li>)}{!item.evidence?.length && <li>暂无补充证据</li>}</ul></div>
                          <div><div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>怎么执行</div><ol className="space-y-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{(item.actions || []).map((text, itemIndex) => <li key={itemIndex}><span className="mr-2 font-mono text-xs" style={{ color: "var(--color-primary)" }}>{String(itemIndex + 1).padStart(2, "0")}</span>{text}</li>)}{!item.actions?.length && <li>暂无执行步骤</li>}</ol></div>
                          <div><div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>如何验收</div><p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.successMetric || "待补充验收指标"}</p>{!!item.examples?.length && <div className="mt-3 rounded-md px-3 py-2 text-xs leading-5" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{item.examples[0]}</div>}</div>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
              {!recommendations.length && (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>暂无优化建议</div>
              )}
            </div>
          )}
        </div>
      )}

      {false && recommendations.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>优化建议</div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {recommendations.slice(0, 3).map((item, index) => (
              <div
                key={item.id || `${item.title}-${index}`}
                className="rounded-md px-3 py-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: priorityColor(item.priority) }}
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.title}</span>
                </div>
                {item.detail && (
                  <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{item.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {aiCitations?.enabled && aiCitations.platforms.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>真实 AI 引用</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            {aiCitations.platforms.map((item) => (
              <div
                key={item.platform}
                className="rounded-md px-3 py-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <AiPlatformLabel
                    platform={item.platform}
                    iconSize={17}
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full"
                    title={item.status}
                    style={{ background: item.status === "completed" ? "var(--color-success)" : "var(--color-error)" }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>提及产品</div>
                    <div style={{ color: item.mentionsProduct ? "var(--color-success)" : "var(--text-secondary)" }}>
                      {item.mentionsProduct ? "是" : "否"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>自有引用</div>
                    <div style={{ color: (item.ownDomainCitationCount ?? 0) > 0 ? "var(--color-success)" : "var(--text-secondary)" }}>
                      {item.ownDomainCitationCount ?? 0}/{item.citationCount}
                    </div>
                  </div>
                </div>
                {item.error && (
                  <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--color-error)" }}>{item.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {aiCitations && (!aiCitations.enabled || aiCitations.platforms.length === 0) && (
        <div
          className="mt-5 rounded-md px-4 py-3 text-sm"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <div className="font-medium" style={{ color: "var(--text-primary)" }}>真实 AI 引用</div>
          <div className="mt-1">
            {aiCitations.enabled
              ? "已启用真实 AI 引用检查，但本次没有返回平台结果。请检查平台配置或稍后重新分析。"
              : "本次分析请求了真实 AI 引用检查，但后端全局开关未启用，因此未调用真实 AI 平台。"}
          </div>
        </div>
      )}
    </section>
  );
}
