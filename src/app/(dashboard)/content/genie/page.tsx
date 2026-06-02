"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useState } from "react";
import { Sparkles, Plus, Trash2, Loader2, ExternalLink, Globe } from "lucide-react";
import Link from "next/link";
import { useProject } from "@/components/project/project-context";

interface GenieSource {
  id: string;
  url?: string;
  title?: string;
  type?: string;
  status?: string;
  createdAt: string;
}

interface GenieGeneration {
  id: string;
  sourceId?: string;
  status: string;
  result?: string;
  createdAt: string;
}

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "20px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  outline: "none",
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "处理中", color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  completed: { label: "已完成", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed: { label: "失败", color: "var(--color-error)", bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
  analyzing: { label: "分析中", color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)" },
};

function GenieInner() {
  const { currentProjectId } = useProject();
  const [sources, setSources] = useState<GenieSource[]>([]);
  const [generations, setGenerations] = useState<GenieGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Source form
  const [sourceUrl, setSourceUrl] = useState("");
  const [addingSource, setAddingSource] = useState(false);

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genPlatform, setGenPlatform] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [srcRes, genRes] = await Promise.all([
        fetch(`/api/genie/sources?projectId=${currentProjectId}`),
        fetch(`/api/genie/generate?projectId=${currentProjectId}`),
      ]);
      if (srcRes.ok) {
        const srcJson = await srcRes.json();
        setSources(srcJson.data ?? []);
      }
      if (genRes.ok) {
        const genJson = await genRes.json();
        setGenerations(genJson.data ?? []);
      }
    } catch {
      setError("加载智灵数据失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddSource = async () => {
    if (!currentProjectId || !sourceUrl.trim() || addingSource) return;
    setAddingSource(true);
    try {
      const res = await fetch(`/api/genie/sources?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, url: sourceUrl.trim() }),
      });
      if (!res.ok) throw new Error("添加失败");
      setSourceUrl("");
      fetchData();
    } catch {
      alert("添加来源失败");
    } finally {
      setAddingSource(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!currentProjectId) return;
    if (!confirm("确定要删除这个来源吗？")) return;
    try {
      const res = await fetch(`/api/genie/sources/${id}?projectId=${currentProjectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      fetchData();
    } catch {
      alert("删除失败");
    }
  };

  const handleGenerate = async () => {
    if (!currentProjectId || !genTopic.trim() || generating) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch(`/api/genie/generate?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProjectId,
          topic: genTopic.trim(),
          platform: genPlatform || undefined,
        }),
      });
      if (!res.ok) throw new Error("生成失败");
      const json = await res.json();
      setGenResult(json.data?.content ?? json.data?.result ?? JSON.stringify(json.data));
    } catch {
      alert("生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          智灵
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          AI 自动内容工厂 — 添加来源，一键生成多平台内容
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-20 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-40 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      ) : error ? (
        <div style={card} className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            重试
          </button>
        </div>
      ) : (
        <>
          {/* Add source */}
          <div style={card}>
            <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              添加内容来源
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="输入 URL — 文章、竞品页面、产品链接..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSource()}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
              <button onClick={handleAddSource} disabled={addingSource || !sourceUrl.trim()}
                className="text-sm font-medium px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 shrink-0"
                style={{
                  background: "var(--color-primary)", color: "white", border: "none",
                  fontFamily: "var(--font-body)", cursor: addingSource ? "wait" : "pointer",
                  opacity: addingSource || !sourceUrl.trim() ? 0.6 : 1,
                }}
              >
                {addingSource ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                添加
              </button>
            </div>
          </div>

          {/* Sources list */}
          {sources.length > 0 && (
            <div style={card}>
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                已添加来源 ({sources.length})
              </h3>
              <div className="space-y-2">
                {sources.map((src) => (
                  <div key={src.id} className="flex items-center gap-3 py-2 group">
                    <ExternalLink size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                    <span className="text-sm truncate flex-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {src.title || src.url || "未命名来源"}
                    </span>
                    {src.status && (
                      <span className="text-xs shrink-0" style={{
                        color: statusConfig[src.status]?.color ?? "var(--text-muted)",
                        fontFamily: "var(--font-body)",
                      }}>
                        {statusConfig[src.status]?.label ?? src.status}
                      </span>
                    )}
                    <button onClick={() => handleDeleteSource(src.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate */}
          <div style={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                AI 生成内容
              </h3>
              <button onClick={() => setShowGenerate(!showGenerate)}
                className="text-xs font-medium px-3 py-1 rounded-md"
                style={{
                  background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                  color: "var(--color-primary)", border: "none", cursor: "pointer", fontFamily: "var(--font-body)",
                }}
              >
                {showGenerate ? "收起" : "展开"}
              </button>
            </div>

            {showGenerate && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    主题 <span style={{ color: "var(--color-primary)" }}>*</span>
                  </label>
                  <input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="输入要生成内容的主题" style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    目标平台
                  </label>
                  <input value={genPlatform} onChange={(e) => setGenPlatform(e.target.value)} placeholder="微信公众号, 小红书..." style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                </div>
                <button onClick={handleGenerate} disabled={generating || !genTopic.trim()}
                  className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
                  style={{
                    background: "var(--color-primary)", color: "white", border: "none",
                    fontFamily: "var(--font-body)", cursor: generating ? "wait" : "pointer",
                    opacity: generating || !genTopic.trim() ? 0.6 : 1,
                  }}
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  生成
                </button>

                {genResult && (
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg-hover)" }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                      生成结果
                    </p>
                    <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {genResult}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent generations */}
          {generations.length > 0 && (
            <div style={card}>
              <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                生成历史
              </h3>
              <div className="space-y-2">
                {generations.slice(0, 10).map((gen) => {
                  const sc = statusConfig[gen.status] ?? statusConfig.pending;
                  return (
                    <div key={gen.id} className="flex items-center gap-3 py-2">
                      <Sparkles size={14} className="shrink-0" style={{ color: sc.color }} />
                      <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                        {gen.result ? gen.result.substring(0, 80) + (gen.result.length > 80 ? "..." : "") : "生成中..."}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{ color: sc.color, background: sc.bg, fontFamily: "var(--font-body)" }}
                      >
                        {sc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function GeniePage() {
  return (
    <Suspense fallback={<div className="space-y-4 max-w-3xl"><div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /><div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /></div>}>
      <GenieInner />
    </Suspense>
  );
}
