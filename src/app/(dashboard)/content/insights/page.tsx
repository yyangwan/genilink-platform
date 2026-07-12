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

function StatCards({ data }: { data: ContentIntelligence }) {
  const totalMentions = data.topics.reduce((sum, t) => sum + t.count, 0);
  const topTopic = data.topics.length > 0
    ? data.topics.reduce((a, b) => (a.count > b.count ? a : b)).topic
    : "-";
  const positiveRate = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative > 0
    ? Math.round((data.sentiment.positive / (data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative)) * 100)
    : 0;

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
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {stat.label}
            </span>
          </div>
          <div className="dashboard-stat-value">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function SourceAuthorityList({ sources }: { sources: ContentIntelligence["sources"] }) {
  if (!sources || sources.length === 0) {
    return <div className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>暂无来源数据</div>;
  }

  return (
    <div className="space-y-2">
      {sources.slice(0, 8).map((src, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg px-3 py-2"
          style={{ background: "var(--bg-hover)" }}
        >
          <span className="w-5 shrink-0 text-center text-[11px] font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              {src.domain}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              提及 {src.mention_count} 次
            </div>
          </div>
          <div className="w-12 text-right">
            <span className="text-sm font-semibold" style={{
              fontFamily: "var(--font-mono)",
              color: src.authority_score >= 80 ? "var(--color-success)" : src.authority_score >= 50 ? "var(--color-warning)" : "var(--text-muted)",
            }}>
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
  const data = ci.data;

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
        <PageHeader title="内容洞察" subtitle="AI 生成内容的深度分析" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

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

      {ci.loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="dashboard-skeleton h-20 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="dashboard-skeleton h-72 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
        </div>
      )}

      {ci.error && !ci.loading && (
        <div className="dashboard-surface dashboard-surface--padded">
          <ErrorState onRetry={ci.refetch} />
        </div>
      )}

      {!ci.loading && !ci.error && data && (
        <>
          <StatCards data={data} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <Hash className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                话题分布
              </div>
              <div className="h-[280px]">
                {topicRadarData.length > 0 ? (
                  <TopicRadarChart data={topicRadarData} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    暂无话题数据
                  </div>
                )}
              </div>
            </section>

            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <MessageSquare className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                情感分布
              </div>
              <div className="h-[280px]">
                {sentimentData.some((d) => d.value > 0) ? (
                  <SentimentPieChart data={sentimentData} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    暂无情感数据
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <BarChart3 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                回答结构分布
              </div>
              <div className="h-[280px]">
                {answerStructureData.length > 0 ? (
                  <AnswerStructureChart data={answerStructureData} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    暂无结构数据
                  </div>
                )}
              </div>
            </section>

            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <ExternalLink className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                来源权威度
              </div>
              <SourceAuthorityList sources={data.sources} />
            </section>
          </div>

          <section className="dashboard-surface flex items-center gap-2 px-6 py-3">
            <Brain className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              基于最新审计数据生成 · 分析覆盖 {data.topics.length} 个话题 · {data.sources.length} 个引用来源
            </span>
          </section>
        </>
      )}

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
