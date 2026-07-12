"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "加载失败",
  description = "无法获取数据，请稍后重试",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="dashboard-empty-state">
      <AlertTriangle className="w-10 h-10 mb-3" style={{ color: "var(--color-error)" }} />
      <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        {title}
      </p>
      <p className="text-sm mb-3 text-center max-w-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
        {description}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="dashboard-button dashboard-button--secondary"
          style={{
            color: "var(--color-primary)",
            background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)",
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重新加载
        </button>
      )}
    </div>
  );
}
