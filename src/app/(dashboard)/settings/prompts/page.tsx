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

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

interface Prompt {
  id: string;
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

  const prompts = useSectionFetch<Prompt[]>(promptsUrl);

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
        setAdding(false);
        setForm({ text: "", platform: "", category: "" });
        refetch();
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
        setEditingId(null);
        refetch();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, editingId, editForm, refetch]);

  const handleDelete = useCallback(async () => {
    if (!currentProjectId || !deleteTarget) return;
    try {
      const res = await fetch(`/api/integration/prompts/${deleteTarget.id}?projectId=${currentProjectId}`, {
        method: "DELETE",
      });
      if (res.ok) refetch();
    } catch {
      // silent
    } finally {
      setDeleteTarget(null);
    }
  }, [currentProjectId, deleteTarget, refetch]);

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId || generating) return;
    setGenerating(true);
    try {
      await fetch("/api/integration/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      refetch();
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }, [currentProjectId, generating, refetch]);

  const startEdit = (prompt: Prompt) => {
    setEditingId(prompt.id);
    setEditForm({ text: prompt.text, platform: prompt.platform || "", category: prompt.category || "" });
  };

  const data = prompts.data ?? [];

  const columns = [
    {
      key: "text",
      header: "提示词",
      width: "45%",
      render: (row: Prompt) =>
        editingId === row.id ? (
          <input
            value={editForm.text}
            onChange={(e) => setEditForm((f) => ({ ...f, text: e.target.value }))}
            className="w-full px-2 py-1 rounded text-sm"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
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
        editingId === row.id ? (
          <input
            value={editForm.platform}
            onChange={(e) => setEditForm((f) => ({ ...f, platform: e.target.value }))}
            placeholder="平台"
            className="w-full px-2 py-1 rounded text-sm"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
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
        editingId === row.id ? (
          <input
            value={editForm.category}
            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="分类"
            className="w-full px-2 py-1 rounded text-sm"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
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
        editingId === row.id ? (
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

  if (!loading && projects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="提示词管理" subtitle="管理 AI 分析使用的提示词" />
        <div style={sectionCard}>
          <EmptyState
            icon={MessageSquare}
            title="暂无项目"
            description="请先创建项目，然后管理提示词"
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--bg-elevated)",
                  color: generating ? "var(--text-muted)" : "var(--color-primary)",
                  border: "1px solid var(--border)",
                  cursor: generating ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                  opacity: generating ? 0.7 : 1,
                }}
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary)",
                  color: "#0b0d14",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
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
        <div style={sectionCard}>
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
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
        <div style={sectionCard}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                提示词内容
              </label>
              <textarea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="输入提示词..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  outline: "none",
                }}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  平台
                </label>
                <input
                  value={form.platform}
                  onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                  placeholder="例如 ChatGPT、Perplexity"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  分类
                </label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="例如 品牌查询、产品对比"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.text.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary)",
                  color: "#0b0d14",
                  border: "none",
                  cursor: saving || !form.text.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !form.text.trim() ? 0.5 : 1,
                  fontFamily: "var(--font-body)",
                }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                保存
              </button>
              <button
                onClick={() => setAdding(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data table */}
      {prompts.error ? (
        <div style={sectionCard}>
          <ErrorState onRetry={prompts.refetch} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          rowKey={(row: Prompt) => row.id}
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
        onConfirm={handleDelete}
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
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <PromptsContent />
    </Suspense>
  );
}
