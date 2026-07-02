"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Globe2,
  Loader2,
  Download,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { sectionCard } from "@/components/charts/shared";
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
  const [enableAiCitation, setEnableAiCitation] = useState(false);
  const [crawlerProvider, setCrawlerProvider] = useState<"native" | "firecrawl">("native");
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
  const isRunning = !!analysis && !TERMINAL_STATUSES.includes(analysis.status);

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
          enableAiCitation,
          crawlerProvider,
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
  }, [crawlerProvider, enableAiCitation, fetchAnalysis, pollAnalysis, projectId]);

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
          <label
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-elevated)" }}
          >
            <input
              type="checkbox"
              checked={enableAiCitation}
              onChange={(event) => setEnableAiCitation(event.target.checked)}
              disabled={starting || isRunning}
            />
            真实 AI 引用
          </label>
          <select
            value={crawlerProvider}
            onChange={(event) => setCrawlerProvider(event.target.value as "native" | "firecrawl")}
            disabled={starting || isRunning}
            className="h-9 rounded-md px-2 text-sm"
            title="抓取方式"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "var(--bg-elevated)",
            }}
          >
            <option value="native">Native</option>
            <option value="firecrawl">Firecrawl</option>
          </select>
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
              <div className="flex h-24 items-end gap-2">
                {trendPoints.map((point) => {
                  const height = `${Math.max(8, ((Number(point.overall) || 0) / maxTrendScore) * 100)}%`;
                  return (
                    <div key={point.analysisId} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t"
                        title={`${formatDate(point.date)}: ${point.overall}`}
                        style={{ height, background: scoreColor(point.overall), opacity: 0.85 }}
                      />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {new Date(point.date).getDate()}
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
            {[
              ["details", "详细内容"],
              ["diagnostics", "维度诊断"],
              ["recommendations", "优化建议"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveView(key as "details" | "diagnostics" | "recommendations")}
                className="rounded px-3 py-1.5 text-sm"
                style={{
                  background: activeView === key ? "var(--color-primary)" : "transparent",
                  color: activeView === key ? "#0b0d14" : "var(--text-secondary)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {activeView === "details" && (
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
                      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {(platformPresence.models || []).map((item) => item.label || item.id).filter(Boolean).join("、") || "--"}
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
                          <span style={{ color: scoreColor(item.score), fontFamily: "var(--font-mono)" }}>{item.score ?? "--"}</span>
                          <span> · {item.label}：{item.advice}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
          )}

          {activeView === "diagnostics" && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {Object.entries(dimensionDiagnostics).map(([key, item]) => (
                <div key={key} className="rounded-md px-4 py-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.label || DIMENSION_LABELS[key as keyof ProductWebsiteScore["dimensions"]] || key}</div>
                    <div className="font-mono text-sm" style={{ color: scoreColor(item.score) }}>{item.score ?? "--"}</div>
                  </div>
                  <p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.summary}</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                      ["证据", item.evidence || []],
                      ["问题", item.issues?.length ? item.issues : ["暂无明显问题"]],
                      ["机会", item.opportunities || []],
                    ].map(([label, values]) => (
                      <div key={label as string}>
                        <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>{label as string}</div>
                        <ul className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {(values as string[]).map((text, index) => <li key={index}>{text}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!Object.keys(dimensionDiagnostics).length && (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>暂无维度诊断</div>
              )}
            </div>
          )}

          {activeView === "recommendations" && (
            <div className="grid grid-cols-1 gap-4">
              {recommendations.map((item, index) => (
                <div key={item.id || `${item.title}-${index}`} className="rounded-md px-4 py-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: priorityColor(item.priority) }} />
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</span>
                      </div>
                      <p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.problem || item.detail}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                      {[item.dimensionLabel || item.dimension, priorityText(item.priority), impactText(item.impact), effortText(item.effort), typeof item.expectedLift === "number" ? `预期 +${item.expectedLift}` : null].filter(Boolean).map((tag) => (
                        <span key={tag} className="rounded px-2 py-1" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div>
                      <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>分析证据</div>
                      <ul className="space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {(item.evidence || []).map((text, evidenceIndex) => <li key={evidenceIndex}>{text}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>执行动作</div>
                      <ol className="space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {(item.actions || []).map((text, actionIndex) => <li key={actionIndex}>{actionIndex + 1}. {text}</li>)}
                      </ol>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>验收指标</div>
                      <p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{item.successMetric || "--"}</p>
                      {!!item.examples?.length && (
                        <div className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                          {item.examples[0]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.platform}
                  </span>
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
