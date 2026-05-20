"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Plus, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { useProject, type ProjectSummary } from "./project-context";
import { useToast } from "@/components/ui/toast-context";

const INDUSTRY_OPTIONS = ["电商", "金融", "医疗", "教育", "科技", "旅游", "其他"];

interface FormData {
  name: string;
  url: string;
  industry: string;
  productName: string;
  productKeywords: string[];
  productDescription: string;
  productUrl: string;
}

const emptyForm: FormData = {
  name: "",
  url: "",
  industry: "",
  productName: "",
  productKeywords: [],
  productDescription: "",
  productUrl: "",
};

export function ProjectWizard() {
  const { wizardOpen, wizardEditProject, closeWizard, refreshProjects, selectProject, projects } =
    useProject();
  const { addToast } = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [keywordInput, setKeywordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepDir, setStepDir] = useState<"forward" | "backward">("forward");
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const isEdit = !!wizardEditProject;

  // Pre-fill on edit
  useEffect(() => {
    if (wizardOpen) {
      if (wizardEditProject) {
        setForm({
          name: wizardEditProject.name,
          url: wizardEditProject.url || "",
          industry: wizardEditProject.industry || "",
          productName: wizardEditProject.productName || "",
          productKeywords: wizardEditProject.productKeywords || [],
          productDescription: wizardEditProject.productDescription || "",
          productUrl: wizardEditProject.productUrl || "",
        });
      } else {
        setForm(emptyForm);
      }
      setStep(0);
      setError(null);
    }
  }, [wizardOpen, wizardEditProject]);

  // Prevent body scroll
  useEffect(() => {
    if (wizardOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [wizardOpen]);

  // Focus trap
  useEffect(() => {
    if (!wizardOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWizard();
      }
      const activeDialog = window.innerWidth >= 768 ? desktopRef.current : mobileRef.current;
      if (e.key === "Tab" && activeDialog) {
        const focusable = activeDialog.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [wizardOpen, closeWizard]);

  const next = useCallback(() => {
    if (step === 0 && !form.name.trim()) {
      setError("项目名称不能为空");
      return;
    }
    setError(null);
    setStepDir("forward");
    setStep((s) => Math.min(s + 1, 2));
  }, [step, form.name]);

  const prev = useCallback(() => {
    setError(null);
    setStepDir("backward");
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        name: form.name.trim(),
        url: form.url.trim() || null,
        industry: form.industry || null,
        productName: form.productName.trim() || null,
        productKeywords: form.productKeywords,
        productDescription: form.productDescription.trim() || null,
        productUrl: form.productUrl.trim() || null,
      };

      const res = isEdit
        ? await fetch(`/api/projects/${wizardEditProject!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "操作失败");
        return;
      }

      const data = await res.json();
      await refreshProjects();

      // Auto-select newly created project
      if (!isEdit && data.project?.id) {
        selectProject(data.project.id);
      }

      addToast({
        type: "success",
        title: isEdit ? "项目已更新" : "项目已创建",
        description: form.name.trim(),
      });

      closeWizard();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }, [form, isEdit, wizardEditProject, refreshProjects, selectProject, addToast, closeWizard]);

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim();
    if (trimmed && !form.productKeywords.includes(trimmed)) {
      setForm((f) => ({ ...f, productKeywords: [...f.productKeywords, trimmed] }));
    }
    setKeywordInput("");
  }, [keywordInput, form.productKeywords]);

  const removeKeyword = useCallback((kw: string) => {
    setForm((f) => ({ ...f, productKeywords: f.productKeywords.filter((k) => k !== kw) }));
  }, []);

  if (!wizardOpen) return null;

  const stepLabels = ["项目信息", "产品信息", isEdit ? "确认编辑" : "确认创建"];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "var(--font-body)",
    outline: "none",
    transition: "border-color var(--duration-short) var(--ease)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) closeWizard(); }}
    >
      <div
        ref={desktopRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 520,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        className="hide-mobile"
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2
            id="wizard-title"
            style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
          >
            {isEdit ? "编辑项目" : "创建项目"}
          </h2>
          <button
            onClick={closeWizard}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 20px", gap: 8 }}>
          {stepLabels.map((label, i) => (
            <React.Fragment key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    background: i < step ? "var(--color-primary)" : i === step ? "var(--color-primary)" : "var(--bg-hover)",
                    color: i <= step ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: i <= step ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: i === step ? 600 : 400,
                  }}
                >
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div
                  style={{
                    width: 32,
                    height: 2,
                    background: i < step ? "var(--color-primary)" : "var(--border)",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error bar */}
        {error && (
          <div
            style={{
              margin: "0 20px",
              padding: "8px 12px",
              background: "color-mix(in srgb, var(--color-error) 15%, transparent)",
              color: "var(--color-error)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Step content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>项目名称 *</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如：我的品牌"
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>网站 URL</label>
                <input
                  style={inputStyle}
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>行业</label>
                <select
                  style={inputStyle}
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                >
                  <option value="">选择行业</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>产品名称</label>
                <input
                  style={inputStyle}
                  value={form.productName}
                  onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                  placeholder="产品或服务名称"
                />
              </div>
              <div>
                <label style={labelStyle}>产品关键词</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(); } }}
                    placeholder="输入关键词后按回车"
                  />
                  <button
                    onClick={addKeyword}
                    style={{
                      padding: "8px 12px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--color-primary)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.productKeywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 10px",
                        background: "var(--color-primary-dim)",
                        color: "var(--color-primary)",
                        borderRadius: "var(--radius-full)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary)", padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>产品描述</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  value={form.productDescription}
                  onChange={(e) => setForm((f) => ({ ...f, productDescription: e.target.value }))}
                  placeholder="简要描述产品特点"
                />
              </div>
              <div>
                <label style={labelStyle}>产品 URL</label>
                <input
                  style={inputStyle}
                  value={form.productUrl}
                  onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
                  placeholder="https://product.example.com"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                  项目信息
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  <div><span style={{ color: "var(--text-secondary)" }}>名称：</span>{form.name}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>行业：</span>{form.industry || "—"}</div>
                  <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-secondary)" }}>URL：</span>{form.url || "—"}</div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                  产品信息
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  <div><span style={{ color: "var(--text-secondary)" }}>产品名称：</span>{form.productName || "—"}</div>
                  <div><span style={{ color: "var(--text-secondary)" }}>产品 URL：</span>{form.productUrl || "—"}</div>
                  {form.productKeywords.length > 0 && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--text-secondary)" }}>关键词：</span>
                      {form.productKeywords.join("、")}
                    </div>
                  )}
                  {form.productDescription && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--text-secondary)" }}>描述：</span>{form.productDescription}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={closeWizard}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "var(--font-body)",
            }}
          >
            取消
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={prev}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                }}
              >
                <ChevronLeft size={14} /> 上一步
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={next}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 16px",
                  background: "var(--color-primary)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                下一步 <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 20px",
                  background: "var(--color-primary)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  color: "#fff",
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting && <Loader2 size={14} className="animate-spinner" />}
                {isEdit ? "保存更改" : "创建项目"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: full-screen variant */}
      <div
        ref={mobileRef}
        className="show-mobile-only"
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: "calc(var(--z-modal) + 1)",
          background: "var(--bg-card)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Mobile header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            onClick={closeWizard}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>
            {isEdit ? "编辑项目" : "创建项目"}
          </span>
          <div style={{ width: 20 }} />
        </div>

        {/* Mobile step content — reuse same steps */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {/* Same content as desktop — simplified for mobile */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>项目名称 *</label>
                <input
                  style={{ ...inputStyle, fontSize: 16 }}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如：我的品牌"
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>网站 URL</label>
                <input
                  style={{ ...inputStyle, fontSize: 16 }}
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>行业</label>
                <select
                  style={{ ...inputStyle, fontSize: 16 }}
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                >
                  <option value="">选择行业</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>产品名称</label>
                <input style={{ ...inputStyle, fontSize: 16 }} value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} placeholder="产品或服务名称" />
              </div>
              <div>
                <label style={labelStyle}>产品关键词</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1, fontSize: 16 }}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(); } }}
                    placeholder="输入关键词后按回车"
                  />
                  <button onClick={addKeyword} style={{ padding: "8px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--color-primary)", cursor: "pointer" }}>
                    <Plus size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.productKeywords.map((kw) => (
                    <span key={kw} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "var(--color-primary-dim)", color: "var(--color-primary)", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 500 }}>
                      {kw}
                      <button onClick={() => removeKeyword(kw)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary)", padding: 0 }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>产品描述</label>
                <textarea style={{ ...inputStyle, fontSize: 16, minHeight: 80, resize: "vertical" }} value={form.productDescription} onChange={(e) => setForm((f) => ({ ...f, productDescription: e.target.value }))} placeholder="简要描述产品特点" />
              </div>
              <div>
                <label style={labelStyle}>产品 URL</label>
                <input style={{ ...inputStyle, fontSize: 16 }} value={form.productUrl} onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))} placeholder="https://product.example.com" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text-primary)" }}>项目信息</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>名称: {form.name} | 行业: {form.industry || "—"}</div>
                <div style={{ color: "var(--text-secondary)" }}>URL: {form.url || "—"}</div>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, fontSize: 13, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text-primary)" }}>产品信息</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>产品: {form.productName || "—"}</div>
                {form.productKeywords.length > 0 && <div style={{ color: "var(--text-secondary)" }}>关键词: {form.productKeywords.join("、")}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Error bar mobile */}
        {error && (
          <div style={{ margin: "0 16px", padding: "8px 12px", background: "color-mix(in srgb, var(--color-error) 15%, transparent)", color: "var(--color-error)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Mobile footer */}
        <div style={{ display: "flex", gap: 8, padding: "16px", borderTop: "1px solid var(--border)" }}>
          {step > 0 && (
            <button onClick={prev} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-body)" }}>
              上一步
            </button>
          )}
          {step < 2 ? (
            <button onClick={next} style={{ flex: 1, padding: "12px", background: "var(--color-primary)", border: "none", borderRadius: "var(--radius-md)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-body)" }}>
              下一步
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: "12px", background: "var(--color-primary)", border: "none", borderRadius: "var(--radius-md)", color: "#fff", cursor: submitting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-body)", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "提交中..." : isEdit ? "保存更改" : "创建项目"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
