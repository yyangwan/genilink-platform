"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── DashboardCard ──────────────────────────────────────────
interface DashboardCardProps {
  title: string;
  className?: string;
  children: React.ReactNode;
  accent?: "default" | "ai";
}

export function DashboardCard({
  title,
  className,
  children,
  accent = "default",
}: DashboardCardProps) {
  return (
    <div
      className={cn("rounded-xl p-6", className)}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <h3
        className="text-base font-semibold mb-4 tracking-tight"
        style={{
          color:
            accent === "ai" ? "var(--color-ai-accent)" : "var(--text-primary)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-cardTitle)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────
interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <p
        className="text-sm text-center"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-body)",
        }}
      >
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--color-primary-dim)",
            color: "var(--color-primary)",
            fontFamily: "var(--font-display)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--color-primary-dim)")
          }
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── ErrorState ─────────────────────────────────────────────
interface ErrorStateProps {
  onRetry?: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <p
        className="text-sm"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-body)",
        }}
      >
        加载失败
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-elevated)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重试
        </button>
      )}
    </div>
  );
}

// ─── LoadingSkeleton ────────────────────────────────────────
interface LoadingSkeletonProps {
  rows?: number;
}

export function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded animate-skeleton-pulse",
            i === 0 ? "h-6 w-3/4" : i === 1 ? "h-6 w-1/2" : "h-6 w-2/3"
          )}
          style={{ background: "var(--bg-hover)" }}
        />
      ))}
    </div>
  );
}
