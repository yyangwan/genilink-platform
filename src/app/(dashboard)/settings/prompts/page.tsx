"use client";

import React, { Suspense, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Check, Loader2, Sparkles, MessageSquare } from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Prompt {
  id: string | number;
  text: string;
  platform: string;
  category: string;
}

interface PromptFormData {
  text: string;
  platform: string;
  category: string;
}

function PromptsContent() {
  const { currentProjectId, projects, loading, openWizard } = useProject();

  const promptsUrl = currentProjectId
    ? `/api/integration/prompts?projectId=${currentProjectId}`
    : null;

  const prompts = useSectionFetch<Prompt[]>(promptsUrl, { notFoundValue: [] });

  // Inline form state
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<PromptFormData>({ text: "", platform: "", category: "" });
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PromptFormData>({ text: "", platform: "", category: "" });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);

  // AI generating state
  const [generating, setGenerating] = useState(false);

  const refetch = prompts.refetch;

  const handleAdd = useCallback(async () => {
    if (!currentProjectId || !form.text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/integration/prompts?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: form.text.trim(),
          platform: form.platform.trim(),
          category: form.category.trim(),
        }),
      });
      if (res.ok) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await refetch();
        setAdding(false);
        setForm({ text: "", platform: "", category: "" });
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, form, refetch]);

  const handleEdit = useCallback(async () => {
    if (!currentProjectId || !editingId || !editForm.text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/integration/prompts/${editingId}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editForm.text.trim(),
          platform: editForm.platform.trim(),
          category: editForm.category.trim(),
        }),
      });
      if (res.ok) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await refetch();
        setEditingId(null);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, editingId, editForm, refetch]);

  const handleDelete = useCallback(async (target: Prompt | null) => {
    if (!currentProjectId || !target) return;
    try {
      const res = await fetch(`/api/integration/prompts/${target.id}?projectId=${currentProjectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Small delay to ensure backend transaction is fully committed
        await new Promise(resolve => setTimeout(resolve, 100));
        await refetch();
      }
    } catch {
      // silent
    } finally {
      setDeleteTarget(null);
    }
  }, [currentProjectId, refetch]);

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId || generating) return;
    setGenerating(true);
    try {
      const currentProjectData = projects.find((project) => project.id === currentProjectId) || null;
      await fetch("/api/integration/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProjectId,
          projectName: currentProjectData?.name,
          projectUrl: currentProjectData?.url,
          industry: currentProjectData?.industry,
          productCategory: currentProjectData?.industry,
          productName: currentProjectData?.productName,
          productKeywords: currentProjectData?.productKeywords,
          productDescription: currentProjectData?.productDescription,
          productUrl: currentProjectData?.productUrl,
        }),
      });
      refetch();
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }, [currentProjectId, generating, projects, refetch]);

  const startEdit = (prompt: Prompt) => {
    setEditingId(String(prompt.id));
    setEditForm({ text: prompt.text, platform: prompt.platform || "", category: prompt.category || "" });
  };

  const data = prompts.data ?? [];

  const columns = [
    {
      key: "text",
      header: "提示词",
      width: "45%",
      render: (row: Prompt) =>
        editingId === String(row.id) ? (
          <input
            value={editForm.text}
            onChange={(e) => setEditForm((f) => ({ ...f, text: e.target.value }))}
            className="dashboard-input px-2 py-1 text-sm"
            autoFocus
          />
        ) : (
          <span
            className="block max-w-md truncate"
            title={row.text}
            style={{ color: "var(--text-primary)" }}
          >
            {row.text}
          </span>
        ),
    },
    {
      key: "platform",
      header: "平台",
      width: "15%",
      render: (row: Prompt) =>
        editingId === String(row.id) ? (
          <input
            value={editForm.platform}
            onChange={(e) => setEditForm((f) => ({ ...f, platform: e.target.value }))}
            placeholder="平台"
            className="dashboard-input px-2 py-1 text-sm"
          />
        ) : (
          <span style={{ color: "var(--text-secondary)" }}>{row.platform || "—"}</span>
        ),
    },
    {
      key: "category",
      header: "分类",
      width: "15%",
      render: (row: Prompt) =>
        editingId === String(row.id) ? (
          <input
            value={editForm.category}
            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="分类"
            className="dashboard-input px-2 py-1 text-sm"
          />
        ) : (
          <span style={{ color: "var(--text-secondary)" }}>{row.category || "—"}</span>
        ),
    },
    {
      key: "actions",
      header: "操作",
      width: "25%",
      render: (row: Prompt) =>
        editingId === String(row.id) ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleEdit}
              disabled={saving}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--color-success)", background: "none", border: "none", cursor: "pointer" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => startEdit(row)}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteTarget(row)}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
    },
  ];

  if (!loading && !currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="提示词管理" subtitle="管理 AI 分析使用的提示词" />
        <div className="dashboard-surface">
          <EmptyState
            icon={MessageSquare}
            title="请先选择项目"
            description="顶部项目选择器里没有找到有效项目。请先切换到一个项目，或者新建项目后再管理提示词。"
            actionLabel="创建项目"
            onAction={() => openWizard()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="提示词管理"
        subtitle="管理 AI 分析使用的提示词"
        actions={
          currentProjectId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="dashboard-button dashboard-button--secondary"
                style={{ color: generating ? "var(--text-muted)" : "var(--color-primary)" }}
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generating ? "生成中..." : "AI 生成"}
              </button>
              <button
                onClick={() => {
                  setAdding(true);
                  setForm({ text: "", platform: "", category: "" });
                }}
                className="dashboard-button dashboard-button--primary"
              >
                <Plus className="w-3.5 h-3.5" />
                添加提示词
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Shimmer effect while AI generating */}
      {generating && (
        <div className="dashboard-surface dashboard-surface--padded">
          <div className="flex items-center gap-3 rounded-lg bg-card px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-primary)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
              <div className="h-3 w-1/2 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            </div>
            <span className="text-xs" style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)" }}>
              AI 正在生成提示词...
            </span>
          </div>
        </div>
      )}

      {/* Add prompt inline form */}
      {adding && (
        <div className="dashboard-surface dashboard-surface--padded">
          <div className="space-y-3">
            <div>
              <label className="dashboard-field-label">
                提示词内容
              </label>
              <textarea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="输入提示词..."
                rows={3}
                className="dashboard-input px-3 py-2 text-sm resize-none"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="dashboard-field-label">
                  平台
                </label>
                <input
                  value={form.platform}
                  onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                  placeholder="例如 ChatGPT、Perplexity"
                  className="dashboard-input px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="dashboard-field-label">
                  分类
                </label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="例如 品牌查询、产品对比"
                  className="dashboard-input px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.text.trim()}
                className="dashboard-button dashboard-button--primary"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                保存
              </button>
              <button
                onClick={() => setAdding(false)}
                className="dashboard-button dashboard-button--secondary"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data table */}
      {prompts.error ? (
        <div className="dashboard-surface">
          <ErrorState onRetry={prompts.refetch} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          rowKey={(row: Prompt) => String(row.id)}
          loading={prompts.loading}
          loadingRows={4}
          emptyContent={
            <EmptyState
              icon={Sparkles}
              title="暂无提示词"
              description="添加提示词或使用 AI 生成分析提示词"
              actionLabel="添加提示词"
              onAction={() => {
                setAdding(true);
                setForm({ text: "", platform: "", category: "" });
              }}
            />
          }
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除提示词"
        message={`确定要删除此提示词吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default function PromptsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
          <div className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />
        </div>
      }
    >
      <PromptsContent />
    </Suspense>
  );
}
