"use client";

import React, { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { useProjectId } from "@/components/project/use-project-id";
import {
  BarChart3,
  AlertCircle,
  TrendingUp,
  Users,
  Globe,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react";
import dynamic from "next/dynamic";

const SentimentPieChart = dynamic(
  () => import("@/components/charts/SentimentPieChart"),
  { ssr: false },
);
const StructureBarChart = dynamic(
  () => import("@/components/charts/StructureBarChart"),
  { ssr: false },
);
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { TabBar } from "@/components/ui/tab-bar";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  ReportData,
  ContentIntelligence,
  StrategicData,
} from "@/types/visibility";
import { sectionCard } from "@/components/charts/shared";
import { formatDateInTimeZone } from "@/lib/time";

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function priorityConfig(priority: string): { color: string; bg: string; label: string } {
  switch (priority) {
    case "high":
      return { color: "var(--color-error)", bg: "var(--color-error)20", label: "高" };
    case "medium":
      return { color: "var(--color-warning)", bg: "var(--color-warning)20", label: "中" };
    default:
      return { color: "var(--color-success)", bg: "var(--color-success)20", label: "低" };
  }
}

/** Transform structure_distribution (keyed by type) into per-audit stacked bar data */
function buildStructureChartData(evolution: {
  audits?: Array<{ audit_id: number; date: string }>;
  structure_distribution: Record<string, Array<{ audit_id: number; count: number; pct: number }>>;
}): Record<string, string | number>[] {
  // Collect all unique audit IDs across all structure types
  const auditIds = new Set<number>();
  for (const points of Object.values(evolution.structure_distribution)) {
    for (const p of points) auditIds.add(p.audit_id);
  }

  // Map audit_id → label using audits array if available
  const auditLabels = new Map<number, string>();
  if (evolution.audits) {
    for (const a of evolution.audits) auditLabels.set(a.audit_id, a.date);
  }

  const sortedIds = [...auditIds].sort((a, b) => a - b);

  // Build lookup: (type, audit_id) → pct
  const lookup = new Map<string, Map<number, number>>();
  for (const [type, points] of Object.entries(evolution.structure_distribution)) {
    const m = new Map<number, number>();
    for (const p of points) m.set(p.audit_id, p.pct);
    lookup.set(type, m);
  }

  return sortedIds.map((id) => {
    const date = auditLabels.get(id);
    const period = date ? formatDateInTimeZone(date, { includeTime: false }) : `#${id}`;
    return {
      period,
      structured: Math.round((lookup.get("list")?.get(id) || 0) * 100),
      semi_structured: Math.round((lookup.get("comparison")?.get(id) || 0) * 100),
      unstructured: Math.round((lookup.get("narrative")?.get(id) || 0) * 100),
    };
  });
}

function insightTypeIcon(type: string) {
  switch (type) {
    case "strength":
      return { color: "var(--color-success)", label: "优势" };
    case "weakness":
      return { color: "var(--color-error)", label: "劣势" };
    case "opportunity":
      return { color: "var(--color-primary)", label: "机会" };
    default:
      return { color: "var(--text-muted)", label: type };
  }
}

// ── Overview Tab ──
function OverviewTab({ report }: { report: ReportData }) {
  return (
    <div className="space-y-6">
      {/* Score hero */}
      <div className="flex flex-col items-center py-6" style={sectionCard}>
        <ScoreGauge
          score={report.overall_score}
          size={180}
          label={report.score_label}
          showPercentile
          percentile={report.percentile}
        />
      </div>

      {/* Platform breakdown */}
      {report.platforms && report.platforms.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            平台得分
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.platforms.map((p) => (
              <div
                key={p.platform}
                className="flex flex-col gap-2 p-4 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                  >
                    {p.platform}
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: scoreColor(p.score), fontFamily: "var(--font-mono)" }}
                  >
                    {p.score}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-hover)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(p.score, 0)}%`,
                      background: scoreColor(p.score),
                    }}
                  />
                </div>
                {p.change != null && (
                  <span
                    className="text-xs"
                    style={{
                      color: p.change >= 0 ? "var(--color-success)" : "var(--color-error)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {p.change >= 0 ? "+" : ""}{p.change}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key insights */}
      {report.insights && report.insights.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            关键发现
          </h3>
          <ul className="space-y-2">
            {report.insights
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
              })
              .map((insight) => {
                const pCfg = priorityConfig(insight.priority);
                const tCfg = insightTypeIcon(insight.type);
                return (
                  <li
                    key={insight.id}
                    className="flex items-start gap-3 py-2 px-3 rounded-lg"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <span
                      className="inline-flex items-center justify-center shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: pCfg.bg,
                        color: pCfg.color,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {pCfg.label}
                    </span>
                    <span
                      className="inline-flex items-center justify-center shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: `${tCfg.color}20`,
                        color: tCfg.color,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {tCfg.label}
                    </span>
                    <span
                      className="text-sm pt-0.5"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                    >
                      {insight.text}
                    </span>
                    {insight.platform && (
                      <span
                        className="shrink-0 text-xs pt-1"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                      >
                        {insight.platform}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Brand mentions */}
      {report.brands && report.brands.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            品牌提及
          </h3>
          <div className="space-y-3">
            {report.brands
              .sort((a, b) => b.mention_count - a.mention_count)
              .map((brand) => {
                const maxCount = Math.max(...report.brands.map((b) => b.mention_count), 1);
                return (
                  <div key={brand.brand} className="flex items-center gap-3">
                    <span
                      className="text-sm w-24 shrink-0 truncate"
                      style={{
                        color: brand.is_own ? "var(--color-primary)" : "var(--text-secondary)",
                        fontFamily: "var(--font-body)",
                        fontWeight: brand.is_own ? 600 : 400,
                      }}
                    >
                      {brand.brand}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-hover)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(brand.mention_count / maxCount) * 100}%`,
                          background: brand.is_own
                            ? "var(--color-primary)"
                            : "var(--text-muted)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-medium w-16 text-right"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {brand.mention_count} 次
                    </span>
                    <span
                      className="text-xs font-medium w-10 text-right"
                      style={{ color: scoreColor(brand.visibility_score), fontFamily: "var(--font-mono)" }}
                    >
                      {brand.visibility_score}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Query detail: which prompts triggered brand mentions */}
      {report.prompts && report.prompts.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            查询详情
          </h3>
          <div className="space-y-2">
            {report.prompts.map((q, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2 px-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <span className="shrink-0 mt-0.5">
                  {q.mentioned ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: "var(--color-success)" }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)", fontFamily: "var(--font-display)" }}
                    >
                      {q.platform}
                    </span>
                    {q.brand && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                      >
                        {q.brand}
                      </span>
                    )}
                    {q.recommended && (
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded"
                        style={{ background: "var(--color-success)20", color: "var(--color-success)", fontFamily: "var(--font-display)" }}
                      >
                        推荐
                      </span>
                    )}
                    {q.rank != null && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                      >
                        #{q.rank}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm truncate"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                  >
                    {q.prompt}
                  </p>
                </div>
                {q.confidence != null && (
                  <span
                    className="text-xs font-medium shrink-0"
                    style={{
                      color: (q.confidence >= 0.7 ? "var(--color-success)" : q.confidence >= 0.4 ? "var(--color-warning)" : "var(--text-muted)"),
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {Math.round(q.confidence * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content Intelligence Tab ──
function ContentTab({
  content,
  loading,
  error,
}: {
  content: ContentIntelligence | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        ))}
      </div>
    );
  }

  if (error || !content) {
    return (
      <div style={sectionCard}>
        <EmptyState
          icon={AlertCircle}
          title="无法加载内容分析"
          description="请稍后重试或检查审计是否已完成"
        />
      </div>
    );
  }

  const sentimentTotal = content.sentiment.positive + content.sentiment.neutral + content.sentiment.negative || 1;

  const sentimentData = [
    { name: "正面", value: content.sentiment.positive, fill: "var(--color-success)" },
    { name: "中性", value: content.sentiment.neutral, fill: "var(--color-warning)" },
    { name: "负面", value: content.sentiment.negative, fill: "var(--color-error)" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Sentiment breakdown */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          情感分析
        </h3>
        <div className="flex items-center gap-4">
          <div style={{ width: 200, height: 200 }}>
            <SentimentPieChart data={sentimentData} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--color-success)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                正面 {content.sentiment.positive} ({Math.round((content.sentiment.positive / sentimentTotal) * 100)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--color-warning)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                中性 {content.sentiment.neutral} ({Math.round((content.sentiment.neutral / sentimentTotal) * 100)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--color-error)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                负面 {content.sentiment.negative} ({Math.round((content.sentiment.negative / sentimentTotal) * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Topics */}
      {content.topics && content.topics.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            热门话题
          </h3>
          <div className="space-y-3">
            {content.topics
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map((topic) => {
                const maxCount = Math.max(...content.topics.map((t) => t.count), 1);
                return (
                  <div key={topic.topic} className="flex items-center gap-3">
                    <span
                      className="text-sm w-32 shrink-0 truncate"
                      style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                    >
                      {topic.topic}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-hover)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(topic.count / maxCount) * 100}%`,
                          background: "var(--color-primary)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs w-8 text-right"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {topic.count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Sources */}
      {content.sources && content.sources.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            来源权威度
          </h3>
          <div className="space-y-3">
            {content.sources
              .sort((a, b) => b.authority_score - a.authority_score)
              .slice(0, 10)
              .map((source) => (
                <div key={source.domain} className="flex items-center gap-3">
                  <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span
                    className="text-sm w-40 shrink-0 truncate"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                  >
                    {source.source || source.domain}
                  </span>
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--bg-hover)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(source.authority_score, 0)}%`,
                        background: scoreColor(source.authority_score),
                      }}
                    />
                  </div>
                  <span
                    className="text-xs w-12 text-right"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {source.mention_count} 次
                  </span>
                  <span
                    className="text-xs w-8 text-right font-medium"
                    style={{ color: scoreColor(source.authority_score), fontFamily: "var(--font-mono)" }}
                  >
                    {source.authority_score}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Strategic Tab ──
function StrategicTab({
  competitor,
  sourceAuthority,
  structureEvolution,
  loading,
  error,
}: {
  competitor: { brands: Array<{ name: string; is_competitor: boolean; mention_frequency: number; sentiment_positive_rate: number; avg_authority: number; mention_count: number }> } | null;
  sourceAuthority: { audits: Array<{ audit_id: number; date: string }>; domain_trends: Array<{ domain: string; data: Array<{ audit_id: number; count: number; authority_avg: number }> }> } | null;
  structureEvolution: { audits: Array<{ audit_id: number; date: string }>; structure_distribution: Record<string, Array<{ audit_id: number; count: number; pct: number }>> } | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        ))}
      </div>
    );
  }

  if (error || (!competitor && !sourceAuthority && !structureEvolution)) {
    return (
      <div style={sectionCard}>
        <EmptyState
          icon={AlertCircle}
          title="无法加载战略分析"
          description="请稍后重试或检查审计是否已完成"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Competitor positioning */}
      {competitor?.brands && competitor.brands.length > 0 && (
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              竞品定位
            </h3>
          </div>
          <div className="space-y-3">
            {competitor.brands
              .sort((a, b) => b.mention_frequency - a.mention_frequency)
              .map((comp) => {
                const score = Math.round(comp.mention_frequency * 100);
                return (
                  <div key={comp.name} className="flex items-center gap-3">
                    <span
                      className="text-sm w-24 shrink-0 truncate"
                      style={{
                        color: !comp.is_competitor ? "var(--color-primary)" : "var(--text-secondary)",
                        fontFamily: "var(--font-body)",
                        fontWeight: !comp.is_competitor ? 600 : 400,
                      }}
                    >
                      {comp.name}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-hover)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(score, 0)}%`,
                          background: !comp.is_competitor ? "var(--color-primary)" : scoreColor(score),
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-medium w-10 text-right"
                      style={{ color: scoreColor(score), fontFamily: "var(--font-mono)" }}
                    >
                      {score}%
                    </span>
                    <span
                      className="text-xs w-16 text-right"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {comp.mention_count} 次
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Source authority over time */}
      {sourceAuthority?.domain_trends && sourceAuthority.domain_trends.length > 0 && (
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              来源权威趋势
            </h3>
          </div>
          <div className="space-y-3">
            {sourceAuthority.domain_trends
              .sort((a, b) => {
                const aTotal = a.data.reduce((s, d) => s + d.count, 0);
                const bTotal = b.data.reduce((s, d) => s + d.count, 0);
                return bTotal - aTotal;
              })
              .slice(0, 10)
              .map((domain) => {
                const totalCount = domain.data.reduce((s, d) => s + d.count, 0);
                const maxCount = Math.max(...sourceAuthority.domain_trends.map((d) => d.data.reduce((s, x) => s + x.count, 0)), 1);
                return (
                  <div key={domain.domain} className="flex items-center gap-3">
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                    <span
                      className="text-sm w-40 shrink-0 truncate"
                      style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                    >
                      {domain.domain}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-hover)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(totalCount / maxCount) * 100}%`,
                          background: "var(--color-primary)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs w-8 text-right"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {totalCount}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Structure evolution */}
      {structureEvolution?.structure_distribution && (
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <h3
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              结构化演变
            </h3>
          </div>
          <div style={{ height: 240 }}>
            <StructureBarChart data={buildStructureChartData(structureEvolution)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Report Content ──
function ReportContent() {
  const params = useParams();
  const auditId = params.id as string;
  const { projectId } = useProjectId();

  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "总览" },
    { id: "content", label: "内容分析" },
    { id: "strategic", label: "战略分析" },
  ];

  // Fetch main report
  const report = useSectionFetch<ReportData>(
    projectId ? `/api/integration/reports/${auditId}?projectId=${projectId}` : null
  );

  // Fetch content intelligence (only when tab active or already loaded)
  const content = useSectionFetch<ContentIntelligence>(
    activeTab === "content" && projectId
      ? `/api/integration/content-intelligence?projectId=${projectId}&auditId=${auditId}`
      : ""
  );

  // Fetch strategic data — 3 separate calls
  const competitor = useSectionFetch<{ brands: Array<{ name: string; is_competitor: boolean; mention_frequency: number; sentiment_positive_rate: number; avg_authority: number; mention_count: number }> }>(
    activeTab === "strategic" && projectId
      ? `/api/integration/strategic/competitor-positioning?projectId=${projectId}&auditId=${auditId}`
      : ""
  );

  const sourceAuthority = useSectionFetch<{ audits: Array<{ audit_id: number; date: string }>; domain_trends: Array<{ domain: string; data: Array<{ audit_id: number; count: number; authority_avg: number }> }> }>(
    activeTab === "strategic" && projectId
      ? `/api/integration/strategic/source-authority?projectId=${projectId}&auditId=${auditId}`
      : ""
  );

  const structureEvolution = useSectionFetch<{ audits: Array<{ audit_id: number; date: string }>; structure_distribution: Record<string, Array<{ audit_id: number; count: number; pct: number }>> }>(
    activeTab === "strategic" && projectId
      ? `/api/integration/strategic/structure-evolution?projectId=${projectId}&auditId=${auditId}`
      : ""
  );

  // Loading state
  if (report.loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="h-10 w-full rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="flex justify-center py-8">
          <div className="h-48 w-48 rounded-full animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (report.error || !report.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="审计报告"
          breadcrumbs={[
            { label: "智見", href: "/visibility" },
            { label: "审计记录", href: "/audits" },
            { label: "审计报告" },
          ]}
        />
        <div style={sectionCard}>
          <EmptyState
            icon={AlertCircle}
            title="无法加载报告"
            description="该审计报告不存在或尚未完成，请返回审计列表查看"
            actionLabel="返回审计列表"
            actionHref="/audits"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`审计报告 #${auditId}`}
        breadcrumbs={[
          { label: "智見", href: "/visibility" },
          { label: "审计记录", href: "/audits" },
          { label: "审计报告" },
        ]}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "overview" && <OverviewTab report={report.data} />}
      {activeTab === "content" && (
        <ContentTab content={content.data} loading={content.loading} error={content.error} />
      )}
      {activeTab === "strategic" && (
        <StrategicTab
          competitor={competitor.data}
          sourceAuthority={sourceAuthority.data}
          structureEvolution={structureEvolution.data}
          loading={competitor.loading || sourceAuthority.loading || structureEvolution.loading}
          error={competitor.error || sourceAuthority.error || structureEvolution.error}
        />
      )}
    </div>
  );
}

export default function AuditReportPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-6 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-10 w-full rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="flex justify-center py-8">
            <div className="h-48 w-48 rounded-full animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        </div>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
