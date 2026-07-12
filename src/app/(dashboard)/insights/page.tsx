"use client";

import React, { Suspense } from "react";
import {
  Brain,
  MessageSquare,
  TrendingUp,
  ExternalLink,
  Globe,
  Hash,
  BarChart3,
} from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import SentimentPieChart from "@/components/charts/SentimentPieChart";
import TopicRadarChart from "@/components/charts/TopicRadarChart";
import AnswerStructureChart from "@/components/charts/AnswerStructureChart";

import type { ContentIntelligence } from "@/types/visibility";

const SENTIMENT_COLORS = {
  positive: "var(--color-success)",
  neutral: "var(--color-warning)",
  negative: "var(--color-error)",
};

/** 4 stat cards for content intelligence */
function StatCards({ data }: { data: ContentIntelligence }) {
  const totalMentions = data.topics.reduce((sum, t) => sum + t.count, 0);
  const topTopic = data.topics.length > 0
    ? data.topics.reduce((a, b) => (a.count > b.count ? a : b)).topic
    : "-";
  const positiveRate = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative > 0
    ? Math.round((data.sentiment.positive / (data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative)) * 100)
    : 0;
  const topSource = data.sources.length > 0 ? data.sources[0].domain : "-";

  const stats = [
    { icon: Hash, label: "话题总数", value: data.topics.length, color: "var(--color-primary)" },
    { icon: MessageSquare, label: "总提及数", value: totalMentions, color: "var(--color-primary)" },
    { icon: TrendingUp, label: "正面情感率", value: `${positiveRate}%`, color: "var(--color-success)" },
    { icon: Globe, label: "最热话题", value: topTopic, color: "var(--color-warning)" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="dashboard-stat-card">
          <div className="flex items-center gap-2 mb-2">
            <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {stat.label}
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Source authority list */
function SourceAuthorityList({ sources }: { sources: ContentIntelligence["sources"] }) {
  if (!sources || sources.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
        暂无来源数据
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sources.slice(0, 8).map((src, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--bg-hover)",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              width: 20,
              textAlign: "center",
            }}
          >
            {i + 1}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {src.domain}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              提及 {src.mention_count} 次
            </div>
          </div>
          <div style={{ width: 48, textAlign: "right" }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: src.authority_score >= 80 ? "var(--color-success)" : src.authority_score >= 50 ? "var(--color-warning)" : "var(--text-muted)",
              }}
            >
              {src.authority_score}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  const url = currentProjectId
    ? `/api/integration/content-intelligence?projectId=${currentProjectId}`
    : null;

  const ci = useSectionFetch<ContentIntelligence>(url);

  // No project selected
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="内容洞察" subtitle="AI 生成内容的深度分析" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  const data = ci.data;

  // Prepare chart data from API response
  const topicRadarData = data?.topics?.map((t) => ({ topic: t.topic, count: t.count })) ?? [];
  const sentimentData = data
    ? [
        { name: "正面", value: data.sentiment.positive, fill: SENTIMENT_COLORS.positive },
        { name: "中性", value: data.sentiment.neutral, fill: SENTIMENT_COLORS.neutral },
        { name: "负面", value: data.sentiment.negative, fill: SENTIMENT_COLORS.negative },
      ]
    : [];
  const answerStructureData = data?.answerStructure ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="内容洞察" subtitle="AI 生成内容的深度分析" />

      {/* Loading skeleton */}
      {ci.loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="dashboard-skeleton h-20 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="dashboard-skeleton h-72 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {ci.error && !ci.loading && (
        <div className="dashboard-surface dashboard-surface--padded">
          <ErrorState onRetry={ci.refetch} />
        </div>
      )}

      {/* Content */}
      {!ci.loading && !ci.error && data && (
        <>
          {/* Stat cards */}
          <StatCards data={data} />

          {/* Row 1: Topic radar + Sentiment pie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <Hash style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                话题分布
              </div>
              <div style={{ height: 280 }}>
                {topicRadarData.length > 0 ? (
                  <TopicRadarChart data={topicRadarData} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
                    暂无话题数据
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <MessageSquare style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                情感分布
              </div>
              <div style={{ height: 280 }}>
                {sentimentData.some((d) => d.value > 0) ? (
                  <SentimentPieChart data={sentimentData} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
                    暂无情感数据
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Answer structure + Source authority */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <BarChart3 style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                回答结构分布
              </div>
              <div style={{ height: 280 }}>
                {answerStructureData.length > 0 ? (
                  <AnswerStructureChart data={answerStructureData} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-body)" }}>
                    暂无结构数据
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <ExternalLink style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
                来源权威度
              </div>
              <SourceAuthorityList sources={data.sources} />
            </div>
          </div>

          {/* Analysis status bar */}
          <div className="dashboard-surface flex items-center gap-2 px-6 py-3">
            <Brain style={{ width: 16, height: 16, color: "var(--color-primary)" }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              基于最新审计数据生成 · 分析覆盖 {data.topics.length} 个话题 · {data.sources.length} 个引用来源
            </span>
          </div>
        </>
      )}

      {/* Empty state — API returned no error but also no data */}
      {!ci.loading && !ci.error && !data && (
        <div className="dashboard-surface dashboard-surface--padded">
          <EmptyState
            icon={Brain}
            title="暂无内容洞察"
            description="运行 AI 审计以获取内容分析数据"
            actionLabel="前往可见性分析"
            actionHref="/visibility"
          />
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="dashboard-skeleton h-20 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <InsightsContent />
    </Suspense>
  );
}
