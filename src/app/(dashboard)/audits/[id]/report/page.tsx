"use client";

import React, { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import {
  BarChart3,
  AlertCircle,
  TrendingUp,
  Users,
  Globe,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
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

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  stroke="none"
                >
                  {sentimentData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    color: "var(--text-primary)",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-body)" }}
                />
              </PieChart>
            </ResponsiveContainer>
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
                          background: topic.sentiment >= 0.5
                            ? "var(--color-success)"
                            : topic.sentiment >= 0
                            ? "var(--color-warning)"
                            : "var(--color-error)",
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
  strategic,
  loading,
  error,
}: {
  strategic: StrategicData | null;
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

  if (error || !strategic) {
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
      {strategic.competitor_positioning && strategic.competitor_positioning.length > 0 && (
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
            {strategic.competitor_positioning
              .sort((a, b) => b.score - a.score)
              .map((comp) => (
                <div key={comp.brand} className="flex items-center gap-3">
                  <span
                    className="text-sm w-24 shrink-0 truncate"
                    style={{
                      color: comp.is_own ? "var(--color-primary)" : "var(--text-secondary)",
                      fontFamily: "var(--font-body)",
                      fontWeight: comp.is_own ? 600 : 400,
                    }}
                  >
                    {comp.brand}
                  </span>
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--bg-hover)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(comp.score, 0)}%`,
                        background: comp.is_own ? "var(--color-primary)" : scoreColor(comp.score),
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-medium w-10 text-right"
                    style={{ color: scoreColor(comp.score), fontFamily: "var(--font-mono)" }}
                  >
                    {comp.score}
                  </span>
                  <span
                    className="text-xs w-12 text-right"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    可见性 {comp.visibility}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Source authority over time */}
      {strategic.source_authority && strategic.source_authority.length > 0 && (
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
          <div className="space-y-4">
            {strategic.source_authority.slice(-5).map((entry) => (
              <div key={entry.date}>
                <div
                  className="text-xs mb-2"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  {entry.date}
                </div>
                <div className="space-y-2">
                  {entry.sources
                    .sort((a, b) => b.authority - a.authority)
                    .slice(0, 5)
                    .map((src) => (
                      <div key={src.source} className="flex items-center gap-3">
                        <span
                          className="text-xs w-32 shrink-0 truncate"
                          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                        >
                          {src.source}
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: "var(--bg-hover)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(src.authority, 0)}%`,
                              background: scoreColor(src.authority),
                            }}
                          />
                        </div>
                        <span
                          className="text-xs w-8 text-right"
                          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                        >
                          {src.authority}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structure evolution */}
      {strategic.structure_evolution && strategic.structure_evolution.length > 0 && (
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={strategic.structure_evolution.slice(-5)}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={{ stroke: "var(--border)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    color: "var(--text-primary)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-body)" }} />
                <Bar dataKey="structured" name="结构化" stackId="a" fill="var(--color-primary)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="semi_structured" name="半结构化" stackId="a" fill="var(--color-primary-dim)" />
                <Bar dataKey="unstructured" name="非结构化" stackId="a" fill="var(--bg-hover)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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

  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "总览" },
    { id: "content", label: "内容分析" },
    { id: "strategic", label: "战略分析" },
  ];

  // Fetch main report
  const report = useSectionFetch<ReportData>(
    `/api/integration/reports/${auditId}`
  );

  // Fetch content intelligence (only when tab active or already loaded)
  const content = useSectionFetch<ContentIntelligence>(
    activeTab === "content"
      ? `/api/integration/content-intelligence?auditId=${auditId}`
      : ""
  );

  // Fetch strategic data (only when tab active or already loaded)
  const strategic = useSectionFetch<StrategicData>(
    activeTab === "strategic"
      ? `/api/integration/strategic?auditId=${auditId}`
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
        <StrategicTab strategic={strategic.data} loading={strategic.loading} error={strategic.error} />
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
