"use client";

import React, { Suspense } from "react";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";

interface ContentItem {
  id: string;
  title: string;
  platform: string;
  status: "draft" | "review" | "published" | "failed";
  createdAt: string;
  qualityScore?: number | null;
}

interface ContentListData {
  items: ContentItem[];
  total: number;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "草稿", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  review: { label: "审核中", color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  published: { label: "已发布", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed: { label: "发布失败", color: "var(--color-error)", bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.draft;
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        color: cfg.color,
        background: cfg.bg,
        fontFamily: "var(--font-body)",
      }}
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
  const { data, loading, error } = useSectionFetch<ContentListData>(listUrl);

  const items = (data as any)?.data?.items ?? [];
  const total = (data as any)?.data?.total ?? 0;

  return (
    <div className="space-y-5">
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
            {loading ? "加载中..." : `共 ${total} 篇内容`}
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
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              还没有内容
            </p>
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
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th
                  className="text-left text-xs font-medium px-5 py-3"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  标题
                </th>
                <th
                  className="text-left text-xs font-medium px-5 py-3"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  状态
                </th>
                <th
                  className="text-left text-xs font-medium px-5 py-3"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  质量分
                </th>
                <th
                  className="text-left text-xs font-medium px-5 py-3"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                >
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: ContentItem) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-5 py-3">
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
                  <td className="px-5 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="text-sm"
                      style={{
                        color: item.qualityScore != null ? "var(--text-primary)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {item.qualityScore != null ? item.qualityScore.toFixed(0) : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
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
