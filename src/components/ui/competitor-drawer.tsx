"use client";

import React from "react";
import { X } from "lucide-react";
import type { CompetitorProfile } from "@/types/visibility";

interface CompetitorDrawerProps {
  open: boolean;
  onClose: () => void;
  competitor: CompetitorProfile | null;
  loading?: boolean;
}

export function CompetitorDrawer({ open, onClose, competitor, loading }: CompetitorDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0, 0, 0, 0.5)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className="fixed top-0 right-0 h-full z-50 w-[480px] max-w-full overflow-y-auto"
        style={{
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--duration-medium) var(--ease)",
        }}
        role="dialog"
        aria-label="竞品详情"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            竞品详情
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-8 w-32 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            <div className="h-32 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          </div>
        ) : competitor ? (
          <div className="p-6 space-y-6">
            {/* Brand name + overall score */}
            <div>
              <h3
                className="text-xl font-bold"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
              >
                {competitor.brand}
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="text-3xl font-bold"
                  style={{
                    color: competitor.overall_score >= 70
                      ? "var(--color-success)"
                      : competitor.overall_score >= 40
                        ? "var(--color-warning)"
                        : "var(--color-error)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {competitor.overall_score}
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  / 100
                </span>
              </div>
            </div>

            {/* Score trend */}
            {competitor.score_trend.length > 0 && (
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <h4
                  className="text-sm font-medium mb-3"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}
                >
                  得分趋势
                </h4>
                <div className="flex items-end gap-1 h-16">
                  {competitor.score_trend.map((point, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${Math.max(point.score, 5)}%`,
                        background: i === competitor.score_trend.length - 1
                          ? "var(--color-primary)"
                          : "var(--bg-hover)",
                        minHeight: 4,
                        transition: "height 0.3s ease",
                      }}
                      title={`${point.date}: ${point.score}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Platform breakdown */}
            {competitor.platform_breakdown.length > 0 && (
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <h4
                  className="text-sm font-medium mb-3"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}
                >
                  平台分布
                </h4>
                <div className="space-y-2">
                  {competitor.platform_breakdown.map((p) => (
                    <div key={p.platform} className="flex items-center gap-3">
                      <span
                        className="text-sm w-20 shrink-0"
                        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                      >
                        {p.platform}
                      </span>
                      <div
                        className="flex-1 h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-hover)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(p.score, 0)}%`,
                            background: p.score >= 60
                              ? "var(--color-success)"
                              : p.score >= 40
                                ? "var(--color-warning)"
                                : "var(--color-error)",
                          }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium w-10 text-right"
                        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                      >
                        {p.score}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sentiment */}
            {competitor.sentiment && (
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <h4
                  className="text-sm font-medium mb-3"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}
                >
                  情感分析
                </h4>
                <div className="flex rounded-full overflow-hidden h-3">
                  <div style={{ width: `${competitor.sentiment.positive}%`, background: "var(--color-success)" }} />
                  <div style={{ width: `${competitor.sentiment.neutral}%`, background: "var(--color-warning)" }} />
                  <div style={{ width: `${competitor.sentiment.negative}%`, background: "var(--color-error)" }} />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs" style={{ color: "var(--color-success)" }}>
                    正面 {competitor.sentiment.positive}%
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                    中性 {competitor.sentiment.neutral}%
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-error)" }}>
                    负面 {competitor.sentiment.negative}%
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              无竞品数据
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
