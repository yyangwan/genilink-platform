"use client";

import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Plus, FileText, Search, Trash2, Send, CheckSquare, Square } from "lucide-react";
import Link from "next/link";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";

interface ContentItem {
  id: string;
  title: string;
  platform: string;
  status: string;
  createdAt: string;
  qualityScore?: number | null;
  scheduledAt?: string | null;
}

interface ContentListData {
  items: ContentItem[];
  total: number;
}

// 10-status badge system
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: "草稿",     color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  generating: { label: "生成中",   color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)" },
  review:     { label: "审核中",   color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  approved:   { label: "已审核",   color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 10%, transparent)" },
  scheduled:  { label: "已排期",   color: "color-mix(in srgb, var(--color-primary) 80%, white)", bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)" },
  publishing: { label: "发布中",   color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 15%, transparent)" },
  published:  { label: "已发布",   color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed:     { label: "发布失败", color: "var(--color-error)",   bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
  archived:   { label: "已归档",   color: "var(--text-muted)",    bg: "var(--bg-hover)" },
  processing: { label: "处理中",   color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 10%, transparent)" },
};

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "微信",
  weibo: "微博",
  douyin: "抖音",
  xiaohongshu: "小红书",
  toutiao: "头条",
  zhihu: "知乎",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, fontFamily: "var(--font-body)" }}
    >
      {cfg.label}
    </span>
  );
}

function ContentListInner() {
  const { currentProjectId } = useProject();
  const listUrl = currentProjectId
    ? `/api/content?projectId=${currentProjectId}`
    : null;
  const { data, loading, error, refetch } = useSectionFetch<{ data: ContentListData }>(listUrl);

  const allItems = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Derived data
  const platforms = useMemo(() => {
    const set = new Set(allItems.map((i) => i.platform).filter(Boolean));
    return Array.from(set);
  }, [allItems]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => (i.title ?? "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (platformFilter !== "all") {
      items = items.filter((i) => i.platform === platformFilter);
    }
    return items;
  }, [allItems, search, statusFilter, platformFilter]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  }, [allSelected, filtered]);

  const handleBulkDelete = async () => {
    if (selected.size === 0 || !currentProjectId) return;
    if (!confirm(`确定要删除选中的 ${selected.size} 篇内容吗？`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/content/${id}?projectId=${currentProjectId}`, { method: "DELETE" })
        )
      );
      setSelected(new Set());
      refetch();
    } catch {
      alert("批量删除失败");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    if (selected.size === 0 || !currentProjectId) return;
    if (!confirm(`确定要发布选中的 ${selected.size} 篇内容吗？`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/content/${id}/publish?projectId=${currentProjectId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: currentProjectId }),
          })
        )
      );
      setSelected(new Set());
      refetch();
    } catch {
      alert("批量发布失败");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            内容列表
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            {loading ? "加载中..." : `共 ${total} 篇内容${filtered.length !== total ? `，筛选 ${filtered.length}` : ""}`}
          </p>
        </div>
        <Link
          href="/content/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "white",
            fontFamily: "var(--font-body)",
            textDecoration: "none",
          }}
        >
          <Plus size={14} />
          新建内容
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题..."
            className="w-full"
            style={{
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 7,
              paddingBottom: 7,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{
              background: statusFilter === "all" ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent",
              color: statusFilter === "all" ? "var(--color-primary)" : "var(--text-muted)",
              border: "none",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
            }}
          >
            全部状态
          </button>
          {Object.entries(STATUS_CONFIG).slice(0, 5).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                background: statusFilter === key ? cfg.bg : "transparent",
                color: statusFilter === key ? cfg.color : "var(--text-muted)",
                border: "none",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Platform filter */}
        {platforms.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPlatformFilter("all")}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{
                background: platformFilter === "all" ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent",
                color: platformFilter === "all" ? "var(--color-primary)" : "var(--text-muted)",
                border: "none",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
              }}
            >
              全部平台
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: platformFilter === p ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent",
                  color: platformFilter === p ? "var(--color-primary)" : "var(--text-muted)",
                  border: "none",
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                {PLATFORM_LABELS[p] ?? p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-lg"
          style={{ background: "color-mix(in srgb, var(--color-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)" }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)" }}>
            已选 {selected.size} 篇
          </span>
          <button
            onClick={handleBulkPublish}
            disabled={bulkLoading}
            className="text-xs font-medium px-3 py-1 rounded-md inline-flex items-center gap-1"
            style={{
              background: "var(--color-primary)",
              color: "white",
              border: "none",
              fontFamily: "var(--font-body)",
              cursor: bulkLoading ? "wait" : "pointer",
              opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <Send size={11} />
            批量发布
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkLoading}
            className="text-xs font-medium px-3 py-1 rounded-md inline-flex items-center gap-1"
            style={{
              background: "transparent",
              color: "var(--color-error)",
              border: "1px solid var(--color-error)",
              fontFamily: "var(--font-body)",
              cursor: bulkLoading ? "wait" : "pointer",
              opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <Trash2 size={11} />
            批量删除
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs ml-auto"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            取消选择
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-5 py-3"
                style={{ borderBottom: i < 5 ? "1px solid var(--border)" : undefined }}
              >
                <div className="h-4 w-4/6 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                <div className="h-4 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>
              加载失败
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {allItems.length === 0 ? "还没有内容" : "没有匹配的内容"}
            </p>
            {allItems.length === 0 && (
              <Link
                href="/content/new"
                className="inline-flex items-center gap-1.5 text-sm font-medium mt-3 px-4 py-2 rounded-lg"
                style={{
                  background: "var(--color-primary)",
                  color: "white",
                  fontFamily: "var(--font-body)",
                  textDecoration: "none",
                }}
              >
                <Plus size={14} />
                创建第一篇内容
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="w-10 px-3 py-3">
                  <button onClick={toggleAll} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {allSelected ? (
                      <CheckSquare size={15} style={{ color: "var(--color-primary)" }} />
                    ) : (
                      <Square size={15} style={{ color: "var(--text-muted)" }} />
                    )}
                  </button>
                </th>
                <th className="text-left text-xs font-medium px-3 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  标题
                </th>
                <th className="text-left text-xs font-medium px-3 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  状态
                </th>
                <th className="text-left text-xs font-medium px-3 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  平台
                </th>
                <th className="text-left text-xs font-medium px-3 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  质量
                </th>
                <th className="text-left text-xs font-medium px-3 py-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="group"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: selected.has(item.id) ? "color-mix(in srgb, var(--color-primary) 5%, transparent)" : undefined,
                  }}
                >
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      {selected.has(item.id) ? (
                        <CheckSquare size={15} style={{ color: "var(--color-primary)" }} />
                      ) : (
                        <Square size={15} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }} />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/content/${item.id}/edit`}
                      className="text-sm"
                      style={{
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-body)",
                        textDecoration: "none",
                      }}
                    >
                      {item.title || "无标题"}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {item.platform ? (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--bg-hover)",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {PLATFORM_LABELS[item.platform] ?? item.platform}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-sm"
                      style={{
                        color: item.qualityScore != null
                          ? item.qualityScore >= 80 ? "var(--color-success)"
                            : item.qualityScore >= 60 ? "var(--color-warning)"
                            : "var(--text-primary)"
                          : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {item.qualityScore != null ? item.qualityScore.toFixed(0) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {new Date(item.createdAt).toLocaleDateString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ContentListPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <ContentListInner />
    </Suspense>
  );
}
