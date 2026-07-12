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
  Award,
  FileText,
  Gauge,
  Layers3,
  Lightbulb,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
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

function compactCard(padding = "16px"): React.CSSProperties {
  return {
    ...sectionCard,
    padding,
  };
}

function IconBadge({
  icon: Icon,
  tone = "primary",
}: {
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "error" | "muted";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : tone === "error"
          ? "var(--color-error)"
          : tone === "muted"
            ? "var(--text-muted)"
            : "var(--color-primary)";

  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{ background: `${color}18`, color }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function SectionTitle({
  icon,
  title,
  meta,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  tone?: "primary" | "success" | "warning" | "error" | "muted";
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <IconBadge icon={icon} tone={tone} />
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          {title}
        </h3>
      </div>
      {meta && (
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "error" | "muted";
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          {label}
        </span>
        <IconBadge icon={icon} tone={tone} />
      </div>
      <div
        className="text-2xl font-bold leading-none"
        style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function MeterRow({
  label,
  value,
  maxValue = 100,
  suffix = "",
  color,
  meta,
}: {
  label: string;
  value: number;
  maxValue?: number;
  suffix?: string;
  color?: string;
  meta?: string;
}) {
  const width = maxValue > 0 ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 0;

  return (
    <div className="flex items-center gap-3">
      <span
        className="w-28 shrink-0 truncate text-sm"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
      >
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${width}%`, background: color ?? scoreColor(value) }}
        />
      </div>
      <span
        className="w-14 shrink-0 text-right text-xs font-medium"
        style={{ color: color ?? scoreColor(value), fontFamily: "var(--font-mono)" }}
      >
        {value}{suffix}
      </span>
      {meta && (
        <span
          className="w-12 shrink-0 text-right text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
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
  const platformCount = report.platforms?.length ?? 0;
  const promptCount = report.prompts?.length ?? 0;
  const mentionedPrompts = report.prompts?.filter((q) => q.mentioned).length ?? 0;
  const ownBrand = report.brands?.find((brand) => brand.is_own);
  const topBrand = report.brands
    ?.slice()
    .sort((a, b) => b.mention_count - a.mention_count)[0];
  const highPriorityCount = report.insights?.filter((insight) => insight.priority === "high").length ?? 0;
  const maxBrandMentions = Math.max(...(report.brands ?? []).map((b) => b.mention_count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[240px_1fr] xl:grid-cols-1">
          <div className="flex items-center justify-center py-4" style={compactCard("16px")}>
            <ScoreGauge
              score={report.overall_score}
              size={154}
              label={report.score_label}
              showPercentile
              percentile={report.percentile}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={Globe} label="覆盖平台" value={platformCount} hint="本次审计样本" />
            <MiniStat
              icon={MessageSquare}
              label="命中查询"
              value={`${mentionedPrompts}/${promptCount || 0}`}
              hint="提及 / 查询"
              tone="success"
            />
            <MiniStat
              icon={Trophy}
              label="首位品牌"
              value={topBrand?.brand ?? "--"}
              hint={topBrand ? `${topBrand.mention_count} 次提及` : "暂无品牌"}
              tone="warning"
            />
            <MiniStat
              icon={AlertCircle}
              label="高优先级"
              value={highPriorityCount}
              hint="待处理发现"
              tone={highPriorityCount > 0 ? "error" : "success"}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {report.platforms && report.platforms.length > 0 && (
            <div style={compactCard()}>
              <SectionTitle icon={BarChart3} title="平台得分" meta={`${report.platforms.length} 个平台`} />
              <div className="space-y-3">
                {report.platforms
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((p) => (
                    <MeterRow
                      key={p.platform}
                      label={p.platform}
                      value={p.score}
                      suffix=""
                      color={scoreColor(p.score)}
                      meta={p.change != null ? `${p.change >= 0 ? "+" : ""}${p.change}` : undefined}
                    />
                  ))}
              </div>
            </div>
          )}

          {report.brands && report.brands.length > 0 && (
            <div style={compactCard()}>
              <SectionTitle
                icon={Award}
                title="品牌提及"
                meta={ownBrand ? `本品牌 ${ownBrand.visibility_score}` : undefined}
                tone="success"
              />
              <div className="space-y-3">
                {report.brands
                  .slice()
                  .sort((a, b) => b.mention_count - a.mention_count)
                  .slice(0, 8)
                  .map((brand) => (
                    <MeterRow
                      key={brand.brand}
                      label={brand.brand}
                      value={brand.mention_count}
                      maxValue={maxBrandMentions}
                      suffix="次"
                      color={brand.is_own ? "var(--color-primary)" : "var(--text-muted)"}
                      meta={String(brand.visibility_score)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {report.insights && report.insights.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={Lightbulb} title="关键发现" meta={`${report.insights.length} 条`} tone="warning" />
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {report.insights
              .slice()
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
              })
              .map((insight) => {
                const pCfg = priorityConfig(insight.priority);
                const tCfg = insightTypeIcon(insight.type);
                return (
                  <div
                    key={insight.id}
                    className="flex items-start gap-3 rounded-lg p-3"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${tCfg.color}18`, color: tCfg.color }}
                    >
                      {insight.type === "strength" ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : insight.type === "weakness" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: pCfg.bg, color: pCfg.color, fontFamily: "var(--font-display)" }}
                        >
                          {pCfg.label}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: `${tCfg.color}20`, color: tCfg.color, fontFamily: "var(--font-display)" }}
                        >
                          {tCfg.label}
                        </span>
                        {insight.platform && (
                          <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                            {insight.platform}
                          </span>
                        )}
                      </div>
                      <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                        {insight.text}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {report.prompts && report.prompts.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={Search} title="查询详情" meta={`展示 ${Math.min(report.prompts.length, 50)} 条`} tone="muted" />
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
          <div key={i} className="dashboard-surface dashboard-surface--padded h-48 animate-skeleton-pulse" />
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
  const positiveRate = Math.round((content.sentiment.positive / sentimentTotal) * 100);
  const negativeRate = Math.round((content.sentiment.negative / sentimentTotal) * 100);
  const topTopic = content.topics?.slice().sort((a, b) => b.count - a.count)[0];
  const topSource = content.sources?.slice().sort((a, b) => b.authority_score - a.authority_score)[0];
  const maxTopicCount = Math.max(...(content.topics ?? []).map((t) => t.count), 1);
  const maxStructureCount = Math.max(...(content.answerStructure ?? []).map((s) => s.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <div style={compactCard()}>
          <SectionTitle icon={Gauge} title="情绪概览" meta={`${sentimentTotal} 条样本`} tone="success" />
          <div className="flex items-center gap-4">
            <div className="h-[168px] w-[168px] shrink-0">
              <SentimentPieChart data={sentimentData} />
            </div>
            <div className="grid flex-1 grid-cols-1 gap-2">
              <MiniStat icon={ShieldCheck} label="正面占比" value={`${positiveRate}%`} tone="success" />
              <MiniStat icon={AlertCircle} label="负面占比" value={`${negativeRate}%`} tone={negativeRate > 20 ? "error" : "muted"} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {sentimentData.map((item) => (
              <div key={item.name} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.fill }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    {item.name}
                  </span>
                </div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniStat icon={Target} label="热门话题" value={topTopic?.topic ?? "--"} hint={topTopic ? `${topTopic.count} 次出现` : "暂无话题"} />
          <MiniStat icon={Globe} label="最高权威来源" value={topSource?.domain ?? "--"} hint={topSource ? `权威 ${topSource.authority_score}` : "暂无来源"} tone="success" />
          <MiniStat icon={Layers3} label="回答结构" value={content.answerStructure?.length ?? 0} hint="已识别类型" tone="warning" />
        </div>
      </div>

      {content.topics && content.topics.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={Target} title="热门话题" meta={`Top ${Math.min(content.topics.length, 10)}`} />
          <div className="space-y-3">
            {content.topics
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map((topic) => (
                <MeterRow
                  key={topic.topic}
                  label={topic.topic}
                  value={topic.count}
                  maxValue={maxTopicCount}
                  color={topic.sentiment >= 60 ? "var(--color-success)" : topic.sentiment >= 35 ? "var(--color-warning)" : "var(--color-error)"}
                  meta={`${topic.sentiment}`}
                />
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {content.sources && content.sources.length > 0 && (
          <div style={compactCard()}>
            <SectionTitle icon={Globe} title="来源权威度" meta={`Top ${Math.min(content.sources.length, 10)}`} tone="success" />
            <div className="space-y-3">
              {content.sources
                .slice()
                .sort((a, b) => b.authority_score - a.authority_score)
                .slice(0, 10)
                .map((source) => (
                  <MeterRow
                    key={source.domain}
                    label={source.source || source.domain}
                    value={source.authority_score}
                    color={scoreColor(source.authority_score)}
                    meta={`${source.mention_count}次`}
                  />
                ))}
            </div>
          </div>
        )}

        {content.answerStructure && content.answerStructure.length > 0 && (
          <div style={compactCard()}>
            <SectionTitle icon={Layers3} title="回答结构" meta={`${content.answerStructure.length} 类`} tone="warning" />
            <div className="space-y-3">
              {content.answerStructure
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((item) => (
                  <MeterRow
                    key={item.type}
                    label={item.type}
                    value={item.count}
                    maxValue={maxStructureCount}
                    color="var(--color-primary)"
                    meta={`${Math.round(item.percentage)}%`}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {content.heatmap && content.heatmap.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={Sparkles} title="平台 × 类目热区" meta={`${content.heatmap.length} 个信号`} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {content.heatmap.map((cell) => (
              <div
                key={`${cell.platform}-${cell.category}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {cell.platform}
                  </div>
                  <div className="truncate text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    {cell.category}
                  </div>
                </div>
                <span className="text-sm font-bold" style={{ color: scoreColor(cell.score), fontFamily: "var(--font-mono)" }}>
                  {cell.score}
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
          <div key={i} className="dashboard-surface dashboard-surface--padded h-48 animate-skeleton-pulse" />
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

  const sortedCompetitors = competitor?.brands
    ?.slice()
    .sort((a, b) => b.mention_frequency - a.mention_frequency) ?? [];
  const ownPosition = sortedCompetitors.find((brand) => !brand.is_competitor);
  const leader = sortedCompetitors[0];
  const maxMentionFrequency = Math.max(...sortedCompetitors.map((brand) => brand.mention_frequency), 0.01);
  const domainRows = sourceAuthority?.domain_trends
    ?.slice()
    .sort((a, b) => {
      const aTotal = a.data.reduce((s, d) => s + d.count, 0);
      const bTotal = b.data.reduce((s, d) => s + d.count, 0);
      return bTotal - aTotal;
    }) ?? [];
  const topDomain = domainRows[0];
  const maxDomainMentions = Math.max(...domainRows.map((d) => d.data.reduce((s, x) => s + x.count, 0)), 1);
  const structureData = structureEvolution?.structure_distribution
    ? buildStructureChartData(structureEvolution)
    : [];
  const latestStructure = structureData[structureData.length - 1];
  const latestStructured = Number(latestStructure?.structured ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MiniStat
          icon={Trophy}
          label="竞争领先者"
          value={leader?.name ?? "--"}
          hint={leader ? `${Math.round(leader.mention_frequency * 100)}% 提及率` : "暂无竞品数据"}
          tone="warning"
        />
        <MiniStat
          icon={Award}
          label="本品牌位置"
          value={ownPosition ? `${Math.round(ownPosition.mention_frequency * 100)}%` : "--"}
          hint={ownPosition ? `${ownPosition.mention_count} 次提及` : "未识别本品牌"}
          tone="primary"
        />
        <MiniStat
          icon={Network}
          label="核心来源"
          value={topDomain?.domain ?? "--"}
          hint={topDomain ? `${topDomain.data.reduce((s, d) => s + d.count, 0)} 次引用` : "暂无来源趋势"}
          tone="success"
        />
      </div>

      {competitor?.brands && competitor.brands.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={Users} title="竞品定位" meta={`${competitor.brands.length} 个品牌`} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {sortedCompetitors.map((comp) => {
                const score = Math.round(comp.mention_frequency * 100);
                const relativeWidth = Math.max(2, (comp.mention_frequency / maxMentionFrequency) * 100);
                return (
                  <div
                    key={comp.name}
                    className="rounded-lg p-3"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm font-medium"
                          style={{
                            color: !comp.is_competitor ? "var(--color-primary)" : "var(--text-primary)",
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {comp.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                          <span>{comp.mention_count} 次提及</span>
                          <span>正向 {Math.round(comp.sentiment_positive_rate * 100)}%</span>
                          <span>权威 {Math.round(comp.avg_authority)}</span>
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-lg font-bold"
                        style={{ color: !comp.is_competitor ? "var(--color-primary)" : scoreColor(score), fontFamily: "var(--font-mono)" }}
                      >
                        {score}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${relativeWidth}%`,
                          background: !comp.is_competitor ? "var(--color-primary)" : scoreColor(score),
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {sourceAuthority?.domain_trends && sourceAuthority.domain_trends.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={TrendingUp} title="来源权威趋势" meta={`${sourceAuthority.audits?.length ?? 0} 次审计`} tone="success" />
          <div className="space-y-3">
            {domainRows
              .slice(0, 10)
              .map((domain) => {
                const totalCount = domain.data.reduce((s, d) => s + d.count, 0);
                const avgAuthority = domain.data.length
                  ? Math.round(domain.data.reduce((s, d) => s + d.authority_avg, 0) / domain.data.length)
                  : 0;
                return (
                  <MeterRow
                    key={domain.domain}
                    label={domain.domain}
                    value={totalCount}
                    maxValue={maxDomainMentions}
                    color={scoreColor(avgAuthority)}
                    meta={`${avgAuthority}`}
                  />
                );
              })}
          </div>
        </div>
      )}

      {structureEvolution?.structure_distribution && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
          <div style={compactCard()}>
            <SectionTitle icon={BarChart3} title="结构化演变" meta={`${structureData.length} 个周期`} tone="warning" />
            <div style={{ height: 240 }}>
              <StructureBarChart data={structureData} />
            </div>
          </div>
          <div style={compactCard()}>
            <SectionTitle icon={FileText} title="最新结构分布" tone="muted" />
            <div className="space-y-3">
              <MiniStat icon={Layers3} label="结构化" value={`${latestStructured}%`} hint="列表型回答占比" tone="primary" />
              <MiniStat
                icon={Network}
                label="半结构化"
                value={`${Number(latestStructure?.semi_structured ?? 0)}%`}
                hint="对比型回答占比"
                tone="warning"
              />
              <MiniStat
                icon={MessageSquare}
                label="叙述型"
                value={`${Number(latestStructure?.unstructured ?? 0)}%`}
                hint="长文本回答占比"
                tone="muted"
              />
            </div>
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
          <div className="dashboard-surface dashboard-surface--padded h-6 w-48 animate-skeleton-pulse" />
          <div className="dashboard-surface dashboard-surface--padded h-10 w-full animate-skeleton-pulse" />
          <div className="flex justify-center py-8">
            <div className="dashboard-surface h-48 w-48 rounded-full animate-skeleton-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="dashboard-surface dashboard-surface--padded h-24 animate-skeleton-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
