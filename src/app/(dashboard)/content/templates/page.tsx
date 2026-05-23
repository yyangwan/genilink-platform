"use client";

import React, { Suspense, useCallback, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, LayoutTemplate } from "lucide-react";
import { useProject } from "@/components/project/project-context";

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  content?: string;
  variables?: string[];
  createdAt: string;
  updatedAt: string;
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

const CATEGORIES = ["社交媒体", "博客文章", "产品描述", "广告文案", "邮件营销", "其他"] as const;

function TemplatesInner() {
  const { currentProjectId } = useProject();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formVariables, setFormVariables] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates?projectId=${currentProjectId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch {
      setError("加载模板失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormCategory("");
    setFormContent("");
    setFormVariables("");
  };

  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormDesc(t.description ?? "");
    setFormCategory(t.category ?? "");
    setFormContent(t.content ?? "");
    setFormVariables(t.variables?.join(", ") ?? "");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!currentProjectId || submitting || !formName.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        projectId: currentProjectId,
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        category: formCategory || undefined,
        content: formContent.trim() || undefined,
        variables: formVariables.trim() ? formVariables.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };

      const url = editingId
        ? `/api/templates/${editingId}?projectId=${currentProjectId}`
        : `/api/templates?projectId=${currentProjectId}`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("保存失败");

      resetForm();
      fetchTemplates();
    } catch {
      alert("保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentProjectId) return;
    if (!confirm("确定要删除这个模板吗？")) return;
    try {
      const res = await fetch(`/api/templates/${id}?projectId=${currentProjectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      fetchTemplates();
    } catch {
      alert("删除失败");
    }
  };

  const filtered = filterCat === "all" ? templates : templates.filter((t) => t.category === filterCat);
  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            内容模板
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            创建可复用的内容模板，支持变量占位符
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
          style={{ background: "var(--color-primary)", color: "white", border: "none", fontFamily: "var(--font-body)", cursor: "pointer" }}
        >
          <Plus size={14} />
          新建模板
        </button>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterCat("all")}
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: filterCat === "all" ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--bg-primary)",
              color: filterCat === "all" ? "var(--color-primary)" : "var(--text-secondary)",
              border: `1px solid ${filterCat === "all" ? "var(--color-primary)" : "var(--border)"}`,
              fontFamily: "var(--font-body)", cursor: "pointer",
            }}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setFilterCat(cat!)}
              className="text-xs px-3 py-1 rounded-full"
              style={{
                background: filterCat === cat ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--bg-primary)",
                color: filterCat === cat ? "var(--color-primary)" : "var(--text-secondary)",
                border: `1px solid ${filterCat === cat ? "var(--color-primary)" : "var(--border)"}`,
                fontFamily: "var(--font-body)", cursor: "pointer",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={card} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              {editingId ? "编辑模板" : "新建模板"}
            </h2>
            <button onClick={resetForm} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              模板名称 <span style={{ color: "var(--color-primary)" }}>*</span>
            </label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如：产品推广文案" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                分类
              </label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}
              >
                <option value="">选择分类</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                变量 <span className="text-xs" style={{ color: "var(--text-muted)" }}>(逗号分隔)</span>
              </label>
              <input value={formVariables} onChange={(e) => setFormVariables(e.target.value)} placeholder="{{品牌名}}, {{产品名}}" style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              描述
            </label>
            <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="模板用途简述" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              模板内容
            </label>
            <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)}
              placeholder="编写模板内容，使用 {{变量名}} 作为占位符..." rows={6}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSubmit} disabled={submitting || !formName.trim()}
              className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
              style={{
                background: "var(--color-primary)", color: "white", border: "none",
                fontFamily: "var(--font-body)", cursor: submitting ? "wait" : "pointer",
                opacity: submitting || !formName.trim() ? 0.6 : 1,
              }}
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {editingId ? "更新" : "创建"}
            </button>
            <button onClick={resetForm}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", fontFamily: "var(--font-body)", cursor: "pointer" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ))}
        </div>
      ) : error ? (
        <div style={card} className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{error}</p>
          <button onClick={fetchTemplates} className="mt-3 text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            重试
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={card} className="text-center py-12">
          <LayoutTemplate size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            {filterCat === "all" ? "还没有模板" : `没有"${filterCat}"分类的模板`}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            创建内容模板，快速生成格式一致的内容
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((t) => (
            <div key={t.id} style={card} className="group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {t.name}
                    </h3>
                    {t.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--bg-hover)", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                      >
                        {t.category}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                      {t.description}
                    </p>
                  )}
                  {t.variables && t.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.variables.map((v, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                          style={{ background: "color-mix(in srgb, var(--color-warning) 10%, transparent)", color: "var(--color-warning)" }}
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-md"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-md"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="space-y-4 max-w-3xl"><div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /><div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /></div>}>
      <TemplatesInner />
    </Suspense>
  );
}
