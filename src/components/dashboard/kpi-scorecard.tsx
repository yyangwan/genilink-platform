"use client";

import React from "react";
import { Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KPIScorecardProps {
  label: string;
  value?: string | number;
  change?: string;
  changeLabel?: string;
  loading?: boolean;
  empty?: boolean;
  error?: boolean;
  locked?: boolean;
  pending?: boolean;
}

export function KPIScorecard({
  label,
  value,
  change,
  changeLabel,
  loading = false,
  empty = false,
  error = false,
  locked = false,
  pending = false,
}: KPIScorecardProps) {
  // Determine if this is an AI-specific label
  const isAiLabel =
    label.includes("AI") || label.includes("ai") || label.includes("可见性");

  const labelColor = isAiLabel
    ? "var(--color-ai-accent)"
    : "var(--text-muted)";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Label */}
      <span
        className="text-xs font-medium uppercase tracking-wider"
        style={{
          color: labelColor,
          fontFamily: "var(--font-display)",
          letterSpacing: "0.06em",
          fontSize: "var(--text-overline)",
        }}
      >
        {label}
      </span>

      {/* Content area — renders based on state */}
      <div className="flex-1 flex flex-col justify-end gap-1.5">
        {/* LOADING state */}
        {loading && (
          <div
            className={cn(
              "h-8 w-24 rounded animate-skeleton-pulse",
              locked && "opacity-40"
            )}
            style={{ background: "var(--bg-hover)" }}
          />
        )}

        {/* LOCKED state */}
        {locked && (
          <div className="flex items-center gap-2">
            <Lock
              className="w-4 h-4"
              style={{ color: "var(--text-muted)" }}
            />
            <span
              className="text-sm"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              升级解锁
            </span>
          </div>
        )}

        {/* PENDING state */}
        {pending && !locked && !loading && (
          <div className="flex items-center gap-2">
            <Loader2
              className="w-4 h-4 animate-spinner"
              style={{ color: "var(--color-ai-accent)" }}
            />
            <span
              className="text-sm"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              正在分析...
            </span>
          </div>
        )}

        {/* ERROR state */}
        {error && !loading && !locked && (
          <span
            className="text-sm"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            数据不可用
          </span>
        )}

        {/* EMPTY state */}
        {empty && !loading && !locked && !error && !pending && (
          <span
            className="text-2xl font-semibold"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            &mdash;
          </span>
        )}

        {/* SUCCESS state */}
        {!loading &&
          !locked &&
          !error &&
          !empty &&
          !pending &&
          value !== undefined && (
            <>
              <span
                className="text-3xl font-bold tracking-tight"
                style={{
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-heroMetric)",
                  letterSpacing: "-0.02em",
                }}
              >
                {value}
              </span>
              {change && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: change.startsWith("-")
                        ? "var(--color-error)"
                        : "var(--color-success)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {change.startsWith("+") ? change : change.startsWith("-") ? change : `+${change}`}
                  </span>
                  {changeLabel && (
                    <span
                      className="text-xs"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {changeLabel}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
