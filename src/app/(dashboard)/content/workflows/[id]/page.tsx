"use client";

/**
 * 工作流进度页（设计 §16.3）：/content/workflows/{workflowId}
 * 2.5 秒轮询，终态停止；单请求 10 秒超时。
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { useToast } from "@/components/ui/toast-context";
import {
  WorkflowProgress,
  isTerminalStatus,
  type WorkflowData,
} from "@/components/content/workflow-progress";

const POLL_INTERVAL_MS = 2_500;
const REQUEST_TIMEOUT_MS = 10_000;

function WorkflowInner() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id ?? "";
  const { currentProjectId } = useProject();
  const { addToast } = useToast();
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 轮询世代（R11）：人工重试成功后自增，effect 重启轮询——
  // 此前终态后不再安排定时器，重试成功页面永远显示“排队中”。
  const [pollNonce, setPollNonce] = useState(0);

  const fetchWorkflow = useCallback(async (): Promise<WorkflowData | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        `/api/content/workflows/${encodeURIComponent(workflowId)}?projectId=${currentProjectId}`,
        { signal: controller.signal },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json?.error?.message ?? "工作流加载失败");
        return null;
      }
      return json.data as WorkflowData;
    } catch {
      return null; // 单次轮询失败静默，下轮重试
    } finally {
      clearTimeout(timer);
    }
  }, [workflowId, currentProjectId]);

  useEffect(() => {
    if (!workflowId || !currentProjectId) return;
    let cancelled = false;
    // 终态是本世代的局部状态：重试成功 → pollNonce 变化 → 新世代重新轮询（R11）。
    let terminal = false;

    const poll = async () => {
      const next = await fetchWorkflow();
      if (cancelled) return;
      if (next) {
        setData(next);
        setLoadError(null);
        if (isTerminalStatus(next.status)) {
          terminal = true;
        }
      }
      setLoading(false);
      if (!terminal && !cancelled) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [workflowId, currentProjectId, fetchWorkflow, pollNonce]);

  const handleRetry = useCallback(
    async (platform: string) => {
      try {
        const res = await fetch(
          `/api/content/workflows/${encodeURIComponent(workflowId)}/platforms/${encodeURIComponent(platform)}/retry?projectId=${currentProjectId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast({
            type: "error",
            title: "重试失败",
            description: json?.error?.message ?? "请稍后重试。",
          });
          return;
        }
        setData(json.data as WorkflowData);
        // 重试成功：推进轮询世代，恢复进度刷新（R11）。
        setPollNonce((n) => n + 1);
        addToast({ type: "info", title: "已重新排队", description: "该平台将自动重新生成。" });
      } catch {
        addToast({ type: "error", title: "网络错误", description: "请稍后重试。" });
      }
    },
    [workflowId, currentProjectId, addToast],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
        <div className="dashboard-skeleton h-40 rounded-xl animate-skeleton-pulse" />
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href="/content" className="dashboard-icon-button" style={{ textDecoration: "none" }}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            生成进度
          </h1>
        </div>
        <div className="dashboard-surface dashboard-surface--padded text-sm" style={{ color: "var(--text-secondary)" }}>
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/content" className="dashboard-icon-button" style={{ textDecoration: "none" }}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          生成进度
        </h1>
        {data && (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            创作方案 #{data.briefId.slice(-6)} · 修订 {data.briefRevision}
          </span>
        )}
      </div>

      {data && (
        <WorkflowProgress data={data} projectId={currentProjectId ?? ""} onRetry={handleRetry} />
      )}
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-2xl">
          <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
          <div className="dashboard-skeleton h-40 rounded-xl animate-skeleton-pulse" />
        </div>
      }
    >
      <WorkflowInner />
    </Suspense>
  );
}
