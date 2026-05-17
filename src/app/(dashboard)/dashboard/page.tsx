"use client";

import React, { useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  KPIScorecard,
} from "@/components/dashboard/kpi-scorecard";
import {
  DashboardCard,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/dashboard/widgets";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import type {
  VisibilitySummary,
  GeoSummary,
  ContentSummary,
  Suggestion,
} from "@/types";

// ─── Platform display names ─────────────────────────────────
const PLATFORM_DISPLAY: Record<string, string> = {
  doubao: "豆包",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  qwen: "通义千问",
  wenxin: "文心一言",
  yuanbao: "腾讯元宝",
};

// ─── Service health badge ───────────────────────────────────
function HealthBadge({
  label,
  status,
}: {
  label: string;
  status: "ok" | "degraded" | "down";
}) {
  const dotColor =
    status === "ok"
      ? "var(--color-success)"
      : status === "degraded"
        ? "var(--color-warning)"
        : "var(--color-error)";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
      style={{
        background: "var(--bg-elevated)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-display)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      {label}
    </span>
  );
}

// ─── Radial Score Gauge ─────────────────────────────────────
function RadialGauge({
  score,
  loading,
  locked,
  error,
}: {
  score: number | null;
  loading: boolean;
  locked: boolean;
  error: boolean;
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = useMemo(() => {
    if (score === null) return circumference;
    return circumference - (score / 100) * circumference;
  }, [score, circumference]);

  // Determine color based on score
  const arcColor = useMemo(() => {
    if (score === null) return "var(--text-muted)";
    if (score >= 80) return "var(--color-success)";
    if (score >= 60) return "var(--color-primary)";
    if (score >= 40) return "var(--color-warning)";
    return "var(--color-error)";
  }, [score]);

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--bg-hover)"
            strokeWidth="6"
          />
          {/* Score arc */}
          {!loading && !locked && !error && score !== null && (
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={arcColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="animate-gauge-fill"
              style={{
                transition: `stroke-dashoffset 1s ease-out`,
              }}
            />
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <div
              className="w-10 h-10 rounded-full animate-skeleton-pulse"
              style={{ background: "var(--bg-hover)" }}
            />
          ) : locked ? (
            <span
              className="text-sm"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
            >
              --
            </span>
          ) : error ? (
            <span
              className="text-sm"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
            >
              N/A
            </span>
          ) : score !== null ? (
            <span
              className="text-2xl font-bold"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {score}
            </span>
          ) : (
            <span
              className="text-sm"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              --
            </span>
          )}
        </div>
      </div>
      <span
        className="text-xs font-medium uppercase tracking-wider"
        style={{
          color: "var(--color-ai-accent)",
          fontFamily: "var(--font-display)",
          letterSpacing: "0.06em",
        }}
      >
        AI可见性得分
      </span>
    </div>
  );
}

// ─── Platform Coverage Bar ──────────────────────────────────
function PlatformBar({ name, score }: { name: string; score: number }) {
  const barColor =
    score >= 80
      ? "var(--color-success)"
      : score >= 60
        ? "var(--color-primary)"
        : score >= 40
          ? "var(--color-warning)"
          : "var(--color-error)";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="text-sm w-20 shrink-0"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        {name}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-hover)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(score, 0)}%`,
            background: barColor,
          }}
        />
      </div>
      <span
        className="text-xs font-medium w-10 text-right"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {score}%
      </span>
    </div>
  );
}

// ─── Suggestion Priority Badge ──────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const color =
    priority === "high"
      ? "var(--color-error)"
      : priority === "medium"
        ? "var(--color-warning)"
        : "var(--color-success)";

  const label =
    priority === "high" ? "高" : priority === "medium" ? "中" : "低";

  return (
    <span
      className="inline-flex items-center justify-center w-6 h-5 rounded text-xs font-medium"
      style={{
        background: `${color}20`,
        color,
        fontFamily: "var(--font-display)",
      }}
    >
      {label}
    </span>
  );
}

// ─── Main Dashboard Page ────────────────────────────────────
export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const project = searchParams.get("project");

  // Section-based data fetching
  const visibility = useSectionFetch<VisibilitySummary>(
    `/api/dashboard/visibility${project ? `?project=${project}` : ""}`
  );
  const geo = useSectionFetch<GeoSummary>(
    `/api/dashboard/geo${project ? `?project=${project}` : ""}`
  );
  const content = useSectionFetch<ContentSummary>(
    `/api/dashboard/content${project ? `?project=${project}` : ""}`
  );

  return (
    <div className="space-y-8">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            工作台
          </h1>
          <p
            className="mt-1 text-sm"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            {project
              ? `项目概览 — 实时数据监控`
              : "全局概览 — 实时数据监控"}
          </p>
        </div>

        {/* Service health indicators */}
        <div className="flex items-center gap-2">
          <HealthBadge label="智見" status="ok" />
          <HealthBadge label="智創" status="ok" />
        </div>
      </div>

      {/* ─── Welcome CTA (shown when no data) ──────────────── */}
      {!project && !visibility.loading && !visibility.data?.overallScore && (
        <div
          className="rounded-xl p-6 flex items-center justify-between gap-4"
          style={{
            background: "linear-gradient(135deg, var(--color-primary-dim), var(--bg-elevated))",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <h3
              className="text-base font-semibold mb-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              开始你的第一次 AI 可见性分析
            </h3>
            <p
              className="text-sm"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              创建项目，追踪你的品牌在 DeepSeek、Kimi、通义千问等平台上的可见性
            </p>
          </div>
          <Link
            href="/projects"
            className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--color-primary)",
              color: "#0b0d14",
              fontFamily: "var(--font-display)",
              textDecoration: "none",
            }}
          >
            创建项目
          </Link>
        </div>
      )}

      {/* ─── Hero Composition: Gauge + 3 KPI Cards ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Radial Score Gauge */}
        <DashboardCard title="" className="flex items-center justify-center">
          <RadialGauge
            score={visibility.data?.overallScore ?? null}
            loading={visibility.loading}
            locked={visibility.locked}
            error={visibility.error}
          />
        </DashboardCard>

        {/* 3 KPI Cards stacked */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPIScorecard
            label="品牌提及次数"
            value={visibility.data?.mentionCount}
            loading={visibility.loading}
            locked={visibility.locked}
            error={visibility.error}
            empty={visibility.data?.mentionCount === undefined && !visibility.loading}
          />
          <KPIScorecard
            label="内容发布量"
            value={content.data?.publishedCount}
            loading={content.loading}
            locked={content.locked}
            error={content.error}
            empty={content.data?.publishedCount === undefined && !content.loading}
          />
          <KPIScorecard
            label="竞品对比排名"
            value={
              visibility.data?.competitorRank
                ? `#${visibility.data.competitorRank}`
                : undefined
            }
            loading={visibility.loading}
            locked={visibility.locked}
            error={visibility.error}
            empty={visibility.data?.competitorRank === null && !visibility.loading}
          />
        </div>
      </div>

      {/* ─── 品牌可见性趋势 (placeholder) ──────────────────────── */}
      <DashboardCard title="品牌可见性趋势">
        {visibility.loading ? (
          <LoadingSkeleton rows={4} />
        ) : visibility.error ? (
          <ErrorState onRetry={visibility.refetch} />
        ) : (
          <div
            className="flex items-center justify-center h-48 rounded-lg"
            style={{
              background: "var(--bg-elevated)",
              border: "1px dashed var(--border-strong)",
            }}
          >
            <span
              className="text-sm"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              趋势图表即将上线
            </span>
          </div>
        )}
      </DashboardCard>

      {/* ─── Two-column section: AI平台覆盖 + 最新发布内容 ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Platform Coverage */}
        <DashboardCard title="AI平台覆盖" accent="ai">
          {visibility.loading ? (
            <LoadingSkeleton rows={6} />
          ) : visibility.error ? (
            <ErrorState onRetry={visibility.refetch} />
          ) : visibility.locked ? (
            <EmptyState message="升级解锁AI平台覆盖分析" actionLabel="联系销售" />
          ) : visibility.data?.platformCoverage &&
            visibility.data.platformCoverage.length > 0 ? (
            <div className="space-y-1">
              {visibility.data.platformCoverage.map((p) => (
                <PlatformBar
                  key={p.name}
                  name={PLATFORM_DISPLAY[p.name] ?? p.name}
                  score={p.score}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="暂无平台覆盖数据" />
          )}
        </DashboardCard>

        {/* Latest Published Content */}
        <DashboardCard title="最新发布内容">
          {content.loading ? (
            <LoadingSkeleton rows={4} />
          ) : content.error ? (
            <ErrorState onRetry={content.refetch} />
          ) : content.data?.recentContent &&
            content.data.recentContent.length > 0 ? (
            <ul className="space-y-2">
              {content.data.recentContent.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg transition-colors"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <span
                    className="text-sm truncate max-w-[70%]"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    className="text-xs shrink-0"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {item.platform}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="暂无已发布内容" actionLabel="去创作" />
          )}
        </DashboardCard>
      </div>

      {/* ─── AI Optimization Suggestions ───────────────────── */}
      <DashboardCard title="AI优化建议" accent="ai">
        {geo.loading ? (
          <LoadingSkeleton rows={4} />
        ) : geo.error ? (
          <ErrorState onRetry={geo.refetch} />
        ) : geo.locked ? (
          <EmptyState message="升级解锁AI优化建议" actionLabel="联系销售" />
        ) : visibility.data?.suggestions &&
          visibility.data.suggestions.length > 0 ? (
          <ul className="space-y-2">
            {visibility.data.suggestions.map((s: Suggestion, i: number) => (
              <li
                key={i}
                className="flex items-start gap-3 py-2.5 px-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <PriorityBadge priority={s.priority} />
                <span
                  className="text-sm pt-0.5"
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {s.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="暂无优化建议 — 数据采集中" />
        )}
      </DashboardCard>
    </div>
  );
}
