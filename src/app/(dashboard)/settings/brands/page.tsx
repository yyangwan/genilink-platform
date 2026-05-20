"use client";

import React, { Suspense, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Check, Loader2, Tag } from "lucide-react";
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

interface Brand {
  id: string;
  name: string;
  alias: string;
  is_competitor: boolean;
}

interface BrandFormData {
  name: string;
  alias: string;
  is_competitor: boolean;
}

function BrandsContent() {
  const { currentProjectId, projects, loading, openWizard } = useProject();

  const brandsUrl = currentProjectId
    ? `/api/integration/brands?projectId=${currentProjectId}`
    : null;

  const brands = useSectionFetch<Brand[]>(brandsUrl);

  // Inline form state
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<BrandFormData>({ name: "", alias: "", is_competitor: false });
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BrandFormData>({ name: "", alias: "", is_competitor: false });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  const refetch = brands.refetch;

  const handleAdd = useCallback(async () => {
    if (!currentProjectId || !form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/integration/brands?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), alias: form.alias.trim(), is_competitor: form.is_competitor }),
      });
      if (res.ok) {
        setAdding(false);
        setForm({ name: "", alias: "", is_competitor: false });
        refetch();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, form, refetch]);

  const handleEdit = useCallback(async () => {
    if (!currentProjectId || !editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/integration/brands/${editingId}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name.trim(), alias: editForm.alias.trim(), is_competitor: editForm.is_competitor }),
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
      const res = await fetch(`/api/integration/brands/${deleteTarget.id}?projectId=${currentProjectId}`, {
        method: "DELETE",
      });
      if (res.ok) refetch();
    } catch {
      // silent
    } finally {
      setDeleteTarget(null);
    }
  }, [currentProjectId, deleteTarget, refetch]);

  const startEdit = (brand: Brand) => {
    setEditingId(brand.id);
    setEditForm({ name: brand.name, alias: brand.alias || "", is_competitor: brand.is_competitor });
  };

  const data = brands.data ?? [];

  const columns = [
    {
      key: "name",
      header: "品牌名称",
      width: "30%",
      render: (row: Brand) =>
        editingId === row.id ? (
          <input
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
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
          <span style={{ fontWeight: 500 }}>{row.name}</span>
        ),
    },
    {
      key: "alias",
      header: "别名",
      width: "30%",
      render: (row: Brand) =>
        editingId === row.id ? (
          <input
            value={editForm.alias}
            onChange={(e) => setEditForm((f) => ({ ...f, alias: e.target.value }))}
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
          <span style={{ color: "var(--text-secondary)" }}>{row.alias || "—"}</span>
        ),
    },
    {
      key: "is_competitor",
      header: "类型",
      width: "20%",
      render: (row: Brand) =>
        editingId === row.id ? (
          <button
            onClick={() => setEditForm((f) => ({ ...f, is_competitor: !f.is_competitor }))}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: editForm.is_competitor ? "var(--color-warning)20" : "var(--color-success)20",
              color: editForm.is_competitor ? "var(--color-warning)" : "var(--color-success)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            {editForm.is_competitor ? "竞品" : "自有"}
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: row.is_competitor ? "var(--color-warning)20" : "var(--color-success)20",
              color: row.is_competitor ? "var(--color-warning)" : "var(--color-success)",
            }}
          >
            {row.is_competitor ? "竞品" : "自有"}
          </span>
        ),
    },
    {
      key: "actions",
      header: "操作",
      width: "20%",
      render: (row: Brand) =>
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
        <PageHeader title="品牌管理" subtitle="管理品牌和竞品标签" />
        <div style={sectionCard}>
          <EmptyState
            icon={Tag}
            title="暂无项目"
            description="请先创建项目，然后管理品牌"
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
        title="品牌管理"
        subtitle="管理品牌和竞品标签"
        actions={
          currentProjectId ? (
            <button
              onClick={() => {
                setAdding(true);
                setForm({ name: "", alias: "", is_competitor: false });
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
              添加品牌
            </button>
          ) : undefined
        }
      />

      {/* Add brand inline form */}
      {adding && (
        <div style={sectionCard}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                品牌名称
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="品牌名称"
                className="w-full px-3 py-2 rounded-lg text-sm"
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
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                别名
              </label>
              <input
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="别名（可选）"
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
                类型
              </label>
              <button
                onClick={() => setForm((f) => ({ ...f, is_competitor: !f.is_competitor }))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: form.is_competitor ? "var(--color-warning)20" : "var(--color-success)20",
                  color: form.is_competitor ? "var(--color-warning)" : "var(--color-success)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                {form.is_competitor ? "竞品" : "自有"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary)",
                  color: "#0b0d14",
                  border: "none",
                  cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !form.name.trim() ? 0.5 : 1,
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
      {brands.error ? (
        <div style={sectionCard}>
          <ErrorState onRetry={brands.refetch} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          rowKey={(row: Brand) => row.id}
          loading={brands.loading}
          loadingRows={4}
          emptyContent={
            <EmptyState
              icon={Tag}
              title="还没有品牌"
              description="添加品牌以追踪自有品牌和竞品"
              actionLabel="添加第一个品牌"
              onAction={() => {
                setAdding(true);
                setForm({ name: "", alias: "", is_competitor: false });
              }}
            />
          }
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除品牌"
        message={`确定要删除「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default function BrandsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <BrandsContent />
    </Suspense>
  );
}
