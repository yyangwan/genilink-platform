"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useState } from "react";
import { Plug, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { useProject } from "@/components/project/project-context";

interface PlatformStatus {
  platform: string;
  connected: boolean;
  username?: string;
  expiresAt?: string;
}

const PLATFORMS = [
  { id: "wechat", name: "微信公众号", desc: "连接微信公众号发布内容" },
  { id: "weibo", name: "微博", desc: "连接微博账号发布内容" },
  { id: "douyin", name: "抖音", desc: "连接抖音账号发布短视频内容" },
  { id: "xiaohongshu", name: "小红书", desc: "连接小红书账号发布笔记" },
  { id: "toutiao", name: "今日头条", desc: "连接头条号发布文章" },
  { id: "zhihu", name: "知乎", desc: "连接知乎账号发布文章和回答" },
] as const;

function SettingsInner() {
  const { currentProjectId } = useProject();
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all platform configs
      const results = await Promise.allSettled(
        PLATFORMS.map(async (p) => {
          const res = await fetch(`/api/platform-config/${p.id}?projectId=${currentProjectId}`);
          if (res.ok) {
            const json = await res.json();
            return { platform: p.id, connected: true, ...(json.data ?? {}) };
          }
          return { platform: p.id, connected: false };
        })
      );
      setPlatforms(results.map((r) => (r.status === "fulfilled" ? r.value : { platform: "", connected: false })));
    } catch {
      setError("加载平台配置失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleConnect = async (platformId: string) => {
    if (!currentProjectId || connecting) return;
    setConnecting(platformId);
    try {
      const res = await fetch(`/api/platform-config/${platformId}?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!res.ok) throw new Error("连接失败");
      fetchStatus();
    } catch {
      alert("连接失败，请检查配置");
    } finally {
      setConnecting(null);
    }
  };

  const handleRefresh = async (platformId: string) => {
    if (!currentProjectId || connecting) return;
    setConnecting(platformId);
    try {
      const res = await fetch(`/api/platform-config/${platformId}/refresh?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!res.ok) throw new Error("刷新失败");
      fetchStatus();
    } catch {
      alert("刷新 Token 失败");
    } finally {
      setConnecting(null);
    }
  };

  const getPlatformStatus = (platformId: string): PlatformStatus | undefined =>
    platforms.find((p) => p.platform === platformId);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          平台配置
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          连接社交媒体平台，直接发布内容
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
          <div key={i} className="dashboard-skeleton h-20 rounded-xl animate-skeleton-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="dashboard-surface dashboard-surface--padded text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{error}</p>
          <button onClick={fetchStatus} className="dashboard-button dashboard-button--primary mt-3">
            重试
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map((p) => {
            const status = getPlatformStatus(p.id);
            const isConnected = status?.connected ?? false;
            const isConnecting = connecting === p.id;

            return (
              <div key={p.id} className="dashboard-surface dashboard-surface--padded">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{
                        background: isConnected
                          ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
                          : "var(--bg-hover)",
                      }}
                    >
                      {isConnected ? (
                        <Check size={18} style={{ color: "var(--color-success)" }} />
                      ) : (
                        <Plug size={18} style={{ color: "var(--text-muted)" }} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                        {p.name}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                        {isConnected ? (status?.username ? `已连接: ${status.username}` : "已连接") : p.desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <button onClick={() => handleRefresh(p.id)} disabled={isConnecting}
                        className="dashboard-button dashboard-button--secondary"
                        style={{ minHeight: 30, padding: "6px 12px", cursor: isConnecting ? "wait" : "pointer" }}
                        >
                          {isConnecting ? <Loader2 size={12} className="animate-spin" /> : "刷新 Token"}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleConnect(p.id)} disabled={isConnecting}
                        className="dashboard-button dashboard-button--secondary"
                        style={{ minHeight: 30, padding: "6px 12px", color: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid var(--color-primary)", cursor: isConnecting ? "wait" : "pointer", opacity: isConnecting ? 0.6 : 1 }}
                      >
                        {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                        连接
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="space-y-4 max-w-3xl"><div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /><div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /></div>}>
      <SettingsInner />
    </Suspense>
  );
}
