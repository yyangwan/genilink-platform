"use client";

import React, { Suspense } from "react";
import { BarChart3, FileText, PenLine, Send, Sparkles, Trophy } from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { SubscriptionRequiredState } from "@/components/billing/subscription-required-state";
import { PageHeader } from "@/components/ui/page-header";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

interface AnalyticsData {
  totalContent: number;
  publishedCount: number;
  avgQuality: number | null;
  platformBreakdown: Array<{ platform: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  topPerforming: Array<{ id: string; title: string; score: number }>;
  recentActivity: Array<{ date: string; count: number }>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  review: "审核中",
  scheduled: "已排期",
  published: "已发布",
  failed: "发布失败",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--text-secondary)",
  review: "var(--color-warning)",
  scheduled: "var(--color-primary)",
  published: "var(--color-success)",
  failed: "var(--color-error)",
};

function StatCards({ data }: { data: AnalyticsData }) {
  const stats = [
    { icon: FileText, label: "内容总数", value: data.totalContent, color: "var(--color-primary)" },
    { icon: Send, label: "已发布", value: data.publishedCount, color: "var(--color-success)" },
    {
      icon: Sparkles,
      label: "平均质量分",
      value: data.avgQuality == null ? "—" : data.avgQuality.toFixed(1),
      color: "var(--color-warning)",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="dashboard-stat-card">
          <div className="mb-2 flex items-center gap-2">
            <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </span>
          </div>
          <div className="dashboard-stat-value">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function BreakdownList({
  items,
  getLabel,
  getColor,
}: {
  items: Array<{ key: string; count: number }>;
  getLabel: (key: string) => string;
  getColor: (key: string) => string;
}) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  if (items.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-muted)" }}>暂无数据</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {getLabel(item.key)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 4 : 0)}%`,
                background: getColor(item.key),
              }}
            />
          </div>
          <span className="w-8 text-right text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function InsightsContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const analytics = useSectionFetch<AnalyticsData>(
    currentProjectId ? `/api/analytics?projectId=${currentProjectId}` : null,
  );

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
        <PageHeader title="内容洞察" subtitle="分析内容表现和质量趋势" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  const data = analytics.data;
  const statusItems = data?.statusBreakdown.map((item) => ({ key: item.status, count: item.count })) ?? [];
  const platformItems = data?.platformBreakdown.map((item) => ({ key: item.platform, count: item.count })) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="内容洞察" subtitle="分析内容表现和质量趋势" />

      {analytics.loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="dashboard-skeleton h-24 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[1, 2].map((item) => (
              <div key={item} className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />
            ))}
          </div>
        </div>
      )}

      {analytics.locked && !analytics.loading && (
        <div className="dashboard-surface dashboard-surface--padded">
          <SubscriptionRequiredState feature="智创内容洞察" />
        </div>
      )}

      {analytics.error && !analytics.loading && !analytics.locked && (
        <div className="dashboard-surface dashboard-surface--padded">
          <ErrorState onRetry={analytics.refetch} />
        </div>
      )}

      {!analytics.loading && !analytics.error && !analytics.locked && data && (
        <>
          <StatCards data={data} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <BarChart3 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                内容状态分布
              </div>
              <BreakdownList
                items={statusItems}
                getLabel={(status) => STATUS_LABELS[status] ?? status}
                getColor={(status) => STATUS_COLORS[status] ?? "var(--color-primary)"}
              />
            </section>

            <section className="dashboard-surface dashboard-surface--padded">
              <div className="dashboard-panel-title">
                <PenLine className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                发布平台分布
              </div>
              <BreakdownList
                items={platformItems}
                getLabel={(platform) => platform}
                getColor={() => "var(--color-primary)"}
              />
            </section>
          </div>

          <section className="dashboard-surface dashboard-surface--padded">
            <div className="dashboard-panel-title">
              <Trophy className="h-4 w-4" style={{ color: "var(--color-warning)" }} />
              高质量内容
            </div>
            {data.topPerforming.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {data.topPerforming.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <span className="w-6 text-center text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                      {item.title || "无标题内容"}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--color-success)", fontFamily: "var(--font-mono)" }}>
                      {item.score.toFixed(0)} 分
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>暂无质量评分数据</p>
            )}
          </section>
        </>
      )}

      {!analytics.loading && !analytics.error && !analytics.locked && !data && (
        <div className="dashboard-surface dashboard-surface--padded">
          <EmptyState
            icon={BarChart3}
            title="暂无内容洞察"
            description="创建并完善内容后，这里会展示内容数量、发布状态和质量表现"
            actionLabel="创建内容"
            actionHref="/content/new"
          />
        </div>
      )}
    </div>
  );
}

export default function ContentInsightsPage() {
  return (
    <Suspense
      fallback={<div className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />}
    >
      <InsightsContent />
    </Suspense>
  );
}
