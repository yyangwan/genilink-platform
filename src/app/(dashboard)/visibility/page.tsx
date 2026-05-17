"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye, BarChart3, TrendingUp, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import type { VisibilitySummary } from "@/types";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

export default function VisibilityPage() {
  const visibility = useSectionFetch<VisibilitySummary>("/api/dashboard/visibility");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            智見
          </h1>
          <p
            className="mt-1 text-sm"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            AI搜索可见性分析与品牌监控
          </p>
        </div>
        <button
          onClick={visibility.refetch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${visibility.loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <Eye
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              品牌提及
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span
              className="text-2xl font-bold"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {visibility.data?.mentionCount ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              AI可见性得分
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span
              className="text-2xl font-bold"
              style={{
                color: visibility.data?.overallScore != null && visibility.data.overallScore >= 60
                  ? "var(--color-success)"
                  : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {visibility.data?.overallScore ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              竞品排名
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span
              className="text-2xl font-bold"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {visibility.data?.competitorRank ? `#${visibility.data.competitorRank}` : "--"}
            </span>
          )}
        </div>
      </div>

      {/* Platform coverage or empty state */}
      <div style={sectionCard}>
        {visibility.loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        ) : visibility.data?.platformCoverage && visibility.data.platformCoverage.length > 0 ? (
          <div>
            <h3
              className="text-base font-semibold mb-4"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              AI平台覆盖
            </h3>
            <div className="space-y-3">
              {visibility.data.platformCoverage.map((p: { name: string; score: number }) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span
                    className="text-sm w-20 shrink-0"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                  >
                    {p.name}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(p.score, 0)}%`,
                        background: p.score >= 60 ? "var(--color-success)" : p.score >= 40 ? "var(--color-warning)" : "var(--color-error)",
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium w-10 text-right" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {p.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle
              className="w-10 h-10 mb-3"
              style={{ color: "var(--text-muted)" }}
            />
            <p
              className="text-sm mb-3"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              {visibility.error ? "数据加载失败，请稍后重试" : "暂无可见性数据 — 请先创建项目并触发分析"}
            </p>
            <Link
              href="/projects"
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
            >
              前往项目管理
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {visibility.data?.suggestions && visibility.data.suggestions.length > 0 && (
        <div style={sectionCard}>
          <h3
            className="text-base font-semibold mb-4"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            AI优化建议
          </h3>
          <ul className="space-y-2">
            {visibility.data.suggestions.map((s: { priority: string; text: string }, i: number) => (
              <li
                key={i}
                className="flex items-start gap-3 py-2 px-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0 w-6 h-5 rounded text-xs font-medium"
                  style={{
                    background: s.priority === "high" ? "var(--color-error)20" : s.priority === "medium" ? "var(--color-warning)20" : "var(--color-success)20",
                    color: s.priority === "high" ? "var(--color-error)" : s.priority === "medium" ? "var(--color-warning)" : "var(--color-success)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {s.priority === "high" ? "高" : s.priority === "medium" ? "中" : "低"}
                </span>
                <span className="text-sm pt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                  {s.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
