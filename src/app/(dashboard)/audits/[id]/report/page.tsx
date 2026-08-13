"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProjectId } from "@/components/project/use-project-id";
import {
  BarChart3,
  AlertCircle,
  Users,
  Globe,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Award,
  Gauge,
  Layers3,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";

const SentimentPieChart = dynamic(
  () => import("@/components/charts/SentimentPieChart"),
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
import { getAnswerStructureLabel } from "@/lib/visibility/answer-structure";

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

    </div>
  );
}

// ── Audit Details Tab ──
function AuditDetailsTab({ report }: { report: ReportData }) {
  if (!report.prompts?.length) {
    return <div style={sectionCard}><EmptyState icon={Search} title="暂无审计明细" description="本次审计没有可展示的查询结果" /></div>;
  }

  return (
    <div style={compactCard()}>
      <SectionTitle icon={Search} title="查询与命中明细" meta={`${report.prompts.length} 条`} tone="muted" />
      <p className="mb-4 text-xs leading-5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
        以下数据全部来自审计 #{report.audit_id}，展示各平台查询中品牌是否被提及、推荐及排名情况。
      </p>
      <div className="space-y-2">
        {report.prompts.map((q, i) => (
          <div key={`${q.platform}-${q.prompt}-${q.brand}-${i}`} className="flex items-start gap-3 rounded-lg px-3 py-3" style={{ background: "var(--bg-elevated)" }}>
            <span className="mt-0.5 shrink-0">
              {q.mentioned ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-success)" }} /> : <XCircle className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)", fontFamily: "var(--font-display)" }}>{q.platform}</span>
                {q.brand && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{q.brand}</span>}
                <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: q.mentioned ? "var(--color-success)18" : "var(--bg-hover)", color: q.mentioned ? "var(--color-success)" : "var(--text-muted)" }}>
                  {q.mentioned ? "已提及" : "未提及"}
                </span>
                {q.recommended && <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--color-success)20", color: "var(--color-success)" }}>推荐</span>}
                {q.rank != null && <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>排名 #{q.rank}</span>}
              </div>
              <p className="text-sm leading-6" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{q.prompt}</p>
            </div>
            {q.confidence != null && <span className="shrink-0 text-xs font-medium" style={{ color: q.confidence >= 0.7 ? "var(--color-success)" : q.confidence >= 0.4 ? "var(--color-warning)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{Math.round(q.confidence * 100)}%</span>}
          </div>
        ))}
      </div>
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
                    label={getAnswerStructureLabel(item.type)}
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

// ── Competitor Snapshot Tab ──
function CompetitorSnapshotTab({ report }: { report: ReportData }) {
  const brands = report.brands?.slice().sort((a, b) => b.mention_count - a.mention_count) ?? [];
  const platforms = [...new Set((report.prompts ?? []).map((prompt) => prompt.platform))];
  const maxMentions = Math.max(...brands.map((brand) => brand.mention_count), 1);

  if (brands.length === 0) {
    return <div style={sectionCard}><EmptyState icon={Users} title="暂无竞品快照" description="本次审计没有可展示的品牌提及数据" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3 text-xs leading-5" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        数据范围：仅统计审计 #{report.audit_id} 的品牌提及与推荐结果，不包含其他历史审计。
      </div>
      <div style={compactCard()}>
        <SectionTitle icon={Users} title="本次品牌提及对比" meta={`${brands.length} 个品牌`} />
        <div className="space-y-3">
          {brands.map((brand, index) => (
            <MeterRow
              key={brand.brand}
              label={`${index + 1}. ${brand.brand}`}
              value={brand.mention_count}
              maxValue={maxMentions}
              suffix="次"
              color={brand.is_own ? "var(--color-primary)" : "var(--color-warning)"}
              meta={`${brand.visibility_score}`}
            />
          ))}
        </div>
      </div>
      {platforms.length > 0 && (
        <div style={compactCard()}>
          <SectionTitle icon={BarChart3} title="各平台品牌表现" meta={`${platforms.length} 个平台`} tone="warning" />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ fontFamily: "var(--font-body)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th className="px-3 py-2 text-left text-xs" style={{ color: "var(--text-muted)" }}>品牌</th>
                  {platforms.map((platform) => <th key={platform} className="px-3 py-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>{platform}</th>)}
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.brand} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-3 py-3 font-medium" style={{ color: brand.is_own ? "var(--color-primary)" : "var(--text-primary)" }}>{brand.brand}</td>
                    {platforms.map((platform) => {
                      const rows = report.prompts.filter((prompt) => prompt.brand === brand.brand && prompt.platform === platform);
                      const mentions = rows.filter((prompt) => prompt.mentioned).length;
                      const recommendations = rows.filter((prompt) => prompt.recommended).length;
                      return (
                        <td key={platform} className="px-3 py-3 text-center">
                          <span style={{ color: mentions > 0 ? "var(--color-success)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{mentions}/{rows.length}</span>
                          {recommendations > 0 && <span className="ml-1 text-[11px]" style={{ color: "var(--color-primary)" }}>推荐 {recommendations}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface AuditSuggestion {
  id: string;
  text: string;
  description?: string;
  category?: string;
  platform?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "resolved" | "ignored";
  evidence_summary?: string;
  audit_findings?: string[];
  success_metric?: string;
  expected_result?: string;
}

function SuggestionsTab({ suggestions, loading, error, auditId }: { suggestions: AuditSuggestion[] | null; loading: boolean; error: boolean; auditId: string }) {
  if (loading) return <div className="dashboard-surface dashboard-surface--padded h-72 animate-skeleton-pulse" />;
  if (error) return <div style={sectionCard}><EmptyState icon={AlertCircle} title="无法加载优化建议" description="请稍后重试" /></div>;
  if (!suggestions?.length) return <div style={sectionCard}><EmptyState icon={Lightbulb} title="暂无优化建议" description="本次审计尚未生成优化建议" /></div>;

  const sorted = suggestions.slice().sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 3));
  return (
    <div className="space-y-4">
      <div className="rounded-lg px-4 py-3 text-xs leading-5" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        以下建议由审计 #{auditId} 自动生成，建议内容与审计证据保持不变；执行状态可在优化建议模块持续更新。
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sorted.map((suggestion) => {
          const priority = priorityConfig(suggestion.priority);
          return (
            <article key={suggestion.id} style={compactCard()}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: priority.bg, color: priority.color }}>{priority.label}优先级</span>
                {suggestion.category && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{suggestion.category}</span>}
                {suggestion.platform && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{suggestion.platform}</span>}
                <span className="ml-auto text-xs" style={{ color: suggestion.status === "resolved" ? "var(--color-success)" : "var(--text-muted)" }}>{suggestion.status === "resolved" ? "已处理" : "待处理"}</span>
              </div>
              <h3 className="text-sm font-semibold leading-6" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{suggestion.text}</h3>
              {suggestion.description && <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{suggestion.description}</p>}
              {suggestion.evidence_summary && <div className="mt-3 rounded-lg px-3 py-2 text-xs leading-5" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}><strong>审计依据：</strong>{suggestion.evidence_summary}</div>}
              {suggestion.audit_findings && suggestion.audit_findings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{suggestion.audit_findings.slice(0, 3).map((finding, index) => <li key={index}>{finding}</li>)}</ul>}
              {(suggestion.success_metric || suggestion.expected_result) && <p className="mt-3 text-xs leading-5" style={{ color: "var(--color-success)" }}><strong>预期结果：</strong>{suggestion.success_metric || suggestion.expected_result}</p>}
            </article>
          );
        })}
      </div>
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
    { id: "details", label: "审计明细" },
    { id: "content", label: "内容洞察" },
    { id: "competitors", label: "竞品快照" },
    { id: "suggestions", label: "优化建议" },
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

  const suggestions = useSectionFetch<AuditSuggestion[]>(
    activeTab === "suggestions" && projectId
      ? `/api/integration/suggestions?projectId=${projectId}&auditId=${auditId}`
      : null,
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
      {activeTab === "details" && <AuditDetailsTab report={report.data} />}
      {activeTab === "content" && (
        <ContentTab content={content.data} loading={content.loading} error={content.error} />
      )}
      {activeTab === "competitors" && <CompetitorSnapshotTab report={report.data} />}
      {activeTab === "suggestions" && <SuggestionsTab suggestions={suggestions.data} loading={suggestions.loading} error={suggestions.error} auditId={auditId} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={projectId ? `/trends?project=${encodeURIComponent(projectId)}` : "/trends"} className="dashboard-surface flex items-center justify-between gap-3 px-4 py-3 no-underline">
          <span><strong className="block text-sm" style={{ color: "var(--text-primary)" }}>查看趋势分析</strong><span className="text-xs" style={{ color: "var(--text-muted)" }}>对比多次审计的指标变化</span></span>
          <ArrowRight className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
        </Link>
        <Link href={projectId ? `/strategic?project=${encodeURIComponent(projectId)}` : "/strategic"} className="dashboard-surface flex items-center justify-between gap-3 px-4 py-3 no-underline">
          <span><strong className="block text-sm" style={{ color: "var(--text-primary)" }}>进入战略智能</strong><span className="text-xs" style={{ color: "var(--text-muted)" }}>查看跨审计竞争与结构规律</span></span>
          <ArrowRight className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
        </Link>
      </div>
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
