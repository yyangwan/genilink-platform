"use client";

import React, { Suspense, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Check, Loader2, Tag } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-context";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

interface Brand {
  id: string;
  name: string;
  aliases: string[];
  isCompetitor: boolean;
  logo?: string | null;
  website?: string | null;
  description?: string | null;
  createdAt: string;
}

interface BrandFormData {
  name: string;
  aliases: string;
  isCompetitor: boolean;
}

function BrandsContent() {
  const { addToast } = useToast();

  // Brand list state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch brands (workspace-scoped, no project needed)
  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/brands");
      if (res.ok) {
        setBrands(await res.json());
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchBrands(); }, [fetchBrands]);

  // Inline form state
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<BrandFormData>({ name: "", aliases: "", isCompetitor: false });
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BrandFormData>({ name: "", aliases: "", isCompetitor: false });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          aliases: form.aliases.trim() ? form.aliases.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          isCompetitor: form.isCompetitor,
        }),
      });
      if (res.ok || res.status === 207) {
        setAdding(false);
        setForm({ name: "", aliases: "", isCompetitor: false });
        fetchBrands();
        if (res.status === 207) {
          addToast({ type: "info", title: "品牌已创建，同步正在进行中" });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        addToast({ type: "error", title: data.error || "创建失败" });
      }
    } catch {
      addToast({ type: "error", title: "网络错误，请重试" });
    } finally {
      setSaving(false);
    }
  }, [form, fetchBrands, addToast]);

  const handleEdit = useCallback(async () => {
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          aliases: editForm.aliases.trim() ? editForm.aliases.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [],
          isCompetitor: editForm.isCompetitor,
        }),
      });
      if (res.ok || res.status === 207) {
        setEditingId(null);
        fetchBrands();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast({ type: "error", title: data.error || "更新失败" });
      }
    } catch {
      addToast({ type: "error", title: "网络错误，请重试" });
    } finally {
      setSaving(false);
    }
  }, [editingId, editForm, fetchBrands, addToast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/brands/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchBrands();
      } else {
        addToast({ type: "error", title: "删除失败" });
      }
    } catch {
      addToast({ type: "error", title: "网络错误，请重试" });
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, fetchBrands, addToast]);

  const startEdit = (brand: Brand) => {
    setEditingId(brand.id);
    setEditForm({ name: brand.name, aliases: brand.aliases?.join(", ") || "", isCompetitor: brand.isCompetitor });
  };

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
      key: "aliases",
      header: "别名",
      width: "30%",
      render: (row: Brand) =>
        editingId === row.id ? (
          <input
            value={editForm.aliases}
            onChange={(e) => setEditForm((f) => ({ ...f, aliases: e.target.value }))}
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
          <span style={{ color: "var(--text-secondary)" }}>{row.aliases?.length ? row.aliases.join(", ") : "—"}</span>
        ),
    },
    {
      key: "isCompetitor",
      header: "类型",
      width: "20%",
      render: (row: Brand) =>
        editingId === row.id ? (
          <button
            onClick={() => setEditForm((f) => ({ ...f, isCompetitor: !f.isCompetitor }))}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: editForm.isCompetitor ? "var(--color-warning)20" : "var(--color-success)20",
              color: editForm.isCompetitor ? "var(--color-warning)" : "var(--color-success)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            {editForm.isCompetitor ? "竞品" : "自有"}
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: row.isCompetitor ? "var(--color-warning)20" : "var(--color-success)20",
              color: row.isCompetitor ? "var(--color-warning)" : "var(--color-success)",
            }}
          >
            {row.isCompetitor ? "竞品" : "自有"}
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="品牌管理"
        subtitle="管理品牌和竞品标签"
        actions={
          <button
            onClick={() => {
              setAdding(true);
              setForm({ name: "", aliases: "", isCompetitor: false });
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
                value={form.aliases}
                onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                placeholder="别名，逗号分隔"
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
                onClick={() => setForm((f) => ({ ...f, isCompetitor: !f.isCompetitor }))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: form.isCompetitor ? "var(--color-warning)20" : "var(--color-success)20",
                  color: form.isCompetitor ? "var(--color-warning)" : "var(--color-success)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                {form.isCompetitor ? "竞品" : "自有"}
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
      {error ? (
        <div style={sectionCard}>
          <ErrorState onRetry={fetchBrands} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={brands}
          rowKey={(row: Brand) => row.id}
          loading={loading}
          loadingRows={4}
          emptyContent={
            <EmptyState
              icon={Tag}
              title="还没有品牌"
              description="添加品牌以追踪自有品牌和竞品"
              actionLabel="添加第一个品牌"
              onAction={() => {
                setAdding(true);
                setForm({ name: "", aliases: "", isCompetitor: false });
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
