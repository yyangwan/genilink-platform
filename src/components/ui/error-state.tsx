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
    <div className="flex flex-col items-center justify-center py-12">
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
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            color: "var(--color-primary)",
            background: "var(--color-primary)15",
            border: "1px solid var(--color-primary)30",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary)25")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)15")}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重新加载
        </button>
      )}
    </div>
  );
}
