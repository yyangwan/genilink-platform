"use client";

/**
 * 工作流进度（设计 §16.3）：每个平台的排队/生成/完成/失败状态；
 * 成功平台可进入编辑器，失败平台可单独重试（防连点）。
 */

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, XCircle, Clock, AlertTriangle } from "lucide-react";

export interface WorkflowPlatformView {
  platform: string;
  status: string;
  attemptCount?: number;
  error?: { code: string; message: string };
}

export interface WorkflowData {
  id: string;
  briefId: string;
  briefRevision: number;
  contentPieceId: string | null;
  status: string;
  platforms: WorkflowPlatformView[];
}

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "微信公众号",
  weibo: "微博",
  douyin: "抖音",
  xiaohongshu: "小红书",
  toutiao: "今日头条",
  zhihu: "知乎",
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  generating: "生成中",
  succeeded: "全部完成",
  partial: "部分完成",
  failed: "生成失败",
  cancelled: "已取消",
};

export function isTerminalStatus(status: string): boolean {
  return ["succeeded", "partial", "failed", "cancelled"].includes(status);
}

function PlatformStatusIcon({ status }: { status: string }) {
  if (status === "succeeded") return <CheckCircle2 size={16} style={{ color: "var(--color-success, #10b981)" }} />;
  if (status === "generating") return <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-primary)" }} />;
  if (status === "queued") return <Clock size={16} style={{ color: "var(--text-tertiary)" }} />;
  if (status === "cancelled") return <XCircle size={16} style={{ color: "var(--text-tertiary)" }} />;
  return <AlertTriangle size={16} style={{ color: "var(--color-warning)" }} />;
}

const PLATFORM_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  generating: "生成中",
  succeeded: "已生成",
  failed_retryable: "暂未完成",
  failed_terminal: "生成失败",
  cancelled: "已取消",
};

export function WorkflowProgress({
  data,
  projectId,
  onRetry,
}: {
  data: WorkflowData;
  projectId: string;
  onRetry: (platform: string) => Promise<void>;
}) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const retryLock = useRef(false);

  const handleRetry = useCallback(
    async (platform: string) => {
      if (retryLock.current) return;
      retryLock.current = true;
      setRetrying(platform);
      try {
        await onRetry(platform);
      } finally {
        setRetrying(null);
        retryLock.current = false;
      }
    },
    [onRetry],
  );

  const succeededCount = data.platforms.filter((p) => p.status === "succeeded").length;
  const failedCount = data.platforms.filter(
    (p) => p.status === "failed_retryable" || p.status === "failed_terminal",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isTerminalStatus(data.status) && (
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-primary)" }} />
          )}
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
          >
            {WORKFLOW_STATUS_LABELS[data.status] ?? data.status}
          </span>
        </div>
        {data.status === "partial" && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {succeededCount} 个平台已生成，{failedCount} 个平台暂未完成，可单独重试
          </span>
        )}
      </div>

      <div className="space-y-2">
        {data.platforms.map((run) => (
          <div
            key={run.platform}
            className="flex items-center justify-between gap-3 dashboard-surface dashboard-surface--padded"
          >
            <div className="flex items-center gap-2 min-w-0">
              <PlatformStatusIcon status={run.status} />
              <span
                className="text-sm truncate"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
              >
                {PLATFORM_LABELS[run.platform] ?? run.platform}
              </span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {PLATFORM_STATUS_LABELS[run.status] ?? run.status}
                {run.attemptCount && run.attemptCount > 1 ? `（第 ${run.attemptCount} 次）` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(run.status === "failed_retryable" ||
                // 人工确认状态（R1）：供应商结果不确定的终态失败，重试即确认重跑。
                (run.status === "failed_terminal" &&
                  run.error?.code === "PROVIDER_RESULT_UNCONFIRMED")) && (
                <button
                  onClick={() => handleRetry(run.platform)}
                  disabled={retrying !== null}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{
                    color: "var(--color-primary)",
                    border: "none",
                    padding: "4px 10px",
                    borderRadius: "var(--radius-md)",
                    background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                    cursor: retrying !== null ? "wait" : "pointer",
                  }}
                >
                  {retrying === run.platform ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {retrying === run.platform
                    ? "重试中"
                    : run.error?.code === "PROVIDER_RESULT_UNCONFIRMED"
                      ? "确认并重试"
                      : "重试"}
                </button>
              )}
              {run.status === "succeeded" && data.contentPieceId && (
                <Link
                  href={`/content/${data.contentPieceId}/edit?projectId=${projectId}`}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--color-primary)", textDecoration: "none" }}
                >
                  进入编辑
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {(data.status === "partial" || data.status === "failed") && data.contentPieceId && succeededCount > 0 && (
        <Link
          href={`/content/${data.contentPieceId}/edit?projectId=${projectId}`}
          className="dashboard-button dashboard-button--secondary"
          style={{ textDecoration: "none" }}
        >
          查看已生成内容
        </Link>
      )}
    </div>
  );
}
