"use client";

import React, { Suspense, useCallback, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Mic } from "lucide-react";
import { useProject } from "@/components/project/project-context";

interface BrandVoice {
  id: string;
  name: string;
  description?: string;
  toneKeywords?: string[];
  sampleContent?: string;
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

function BrandVoicesInner() {
  const { currentProjectId } = useProject();
  const [voices, setVoices] = useState<BrandVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTone, setFormTone] = useState("");
  const [formSample, setFormSample] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchVoices = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-voices?projectId=${currentProjectId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setVoices(json.data ?? []);
    } catch {
      setError("加载品牌声音失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => { fetchVoices(); }, [fetchVoices]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormTone("");
    setFormSample("");
  };

  const openEdit = (v: BrandVoice) => {
    setEditingId(v.id);
    setFormName(v.name);
    setFormDesc(v.description ?? "");
    setFormTone(v.toneKeywords?.join(", ") ?? "");
    setFormSample(v.sampleContent ?? "");
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
        toneKeywords: formTone.trim() ? formTone.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        sampleContent: formSample.trim() || undefined,
      };

      const url = editingId
        ? `/api/brand-voices/${editingId}?projectId=${currentProjectId}`
        : `/api/brand-voices?projectId=${currentProjectId}`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("保存失败");

      resetForm();
      fetchVoices();
    } catch {
      alert("保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentProjectId) return;
    if (!confirm("确定要删除这个品牌声音吗？")) return;
    try {
      const res = await fetch(`/api/brand-voices/${id}?projectId=${currentProjectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      fetchVoices();
    } catch {
      alert("删除失败");
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            品牌声音
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            管理 AI 生成内容时使用的品牌语调和风格
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          新建声音
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div style={card} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              {editingId ? "编辑品牌声音" : "新建品牌声音"}
            </h2>
            <button onClick={resetForm} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              名称 <span style={{ color: "var(--color-primary)" }}>*</span>
            </label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如：专业、权威" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              描述
            </label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="描述品牌的声音特点..." rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              语调关键词 <span className="text-xs" style={{ color: "var(--text-muted)" }}>(逗号分隔)</span>
            </label>
            <input value={formTone} onChange={(e) => setFormTone(e.target.value)} placeholder="专业, 亲切, 有说服力" style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              示例内容
            </label>
            <textarea value={formSample} onChange={(e) => setFormSample(e.target.value)} placeholder="粘贴一段符合品牌语调的示例文本..." rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
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
            <div key={i} className="h-24 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ))}
        </div>
      ) : error ? (
        <div style={card} className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>{error}</p>
          <button onClick={fetchVoices} className="mt-3 text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            重试
          </button>
        </div>
      ) : voices.length === 0 ? (
        <div style={card} className="text-center py-12">
          <Mic size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            还没有品牌声音
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            创建品牌声音，让 AI 生成内容时保持一致的品牌语调
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {voices.map((v) => (
            <div key={v.id} style={card} className="group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {v.name}
                  </h3>
                  {v.description && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                      {v.description}
                    </p>
                  )}
                  {v.toneKeywords && v.toneKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {v.toneKeywords.map((kw, i) => (
                        <span key={i}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                            color: "var(--color-primary)",
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded-md"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded-md"
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

export default function BrandVoicesPage() {
  return (
    <Suspense fallback={<div className="space-y-4 max-w-3xl"><div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /><div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} /></div>}>
      <BrandVoicesInner />
    </Suspense>
  );
}
