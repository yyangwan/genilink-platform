"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, X, Loader2, Sparkles, LayoutTemplate, Mic } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { parseContentBriefSearchParams } from "@/lib/content/content-brief";

const PLATFORMS = [
  { id: "wechat", label: "微信公众号" },
  { id: "weibo", label: "微博" },
  { id: "douyin", label: "抖音" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "toutiao", label: "今日头条" },
  { id: "zhihu", label: "知乎" },
] as const;

interface TemplateOption {
  id: string;
  name: string;
  category?: string;
  content?: string;
}

interface BrandVoiceOption {
  id: string;
  name: string;
  toneKeywords?: string[];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  outline: "none",
};

function NewContentInner() {
  const { currentProjectId } = useProject();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialBrief = parseContentBriefSearchParams(searchParams);

  const [topic, setTopic] = useState(initialBrief.topic);
  const [keyPoints, setKeyPoints] = useState<string[]>(initialBrief.keyPoints);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(initialBrief.platforms);
  const [references, setReferences] = useState(initialBrief.references);
  const [notes, setNotes] = useState(initialBrief.notes);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [voices, setVoices] = useState<BrandVoiceOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initialBrief.references || initialBrief.notes));

  useEffect(() => {
    if (!currentProjectId) return;
    Promise.all([
      fetch(`/api/templates?projectId=${currentProjectId}`).then((r) => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
      fetch(`/api/brand-voices?projectId=${currentProjectId}`).then((r) => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ]).then(([tmpl, voiceData]) => {
      setTemplates(tmpl.data ?? []);
      setVoices(voiceData.data ?? []);
    });
  }, [currentProjectId]);

  const addKeyPoint = useCallback(() => {
    setKeyPoints((prev) => [...prev, ""]);
  }, []);

  const removeKeyPoint = useCallback((index: number) => {
    setKeyPoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateKeyPoint = useCallback((index: number, value: string) => {
    setKeyPoints((prev) => prev.map((p, i) => (i === index ? value : p)));
  }, []);

  const togglePlatform = useCallback((id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!currentProjectId || submitting) return;
    if (!topic.trim()) {
      alert("请输入内容主题");
      return;
    }

    const cleanedKeyPoints = keyPoints.map((p) => p.trim()).filter(Boolean);
    const cleanedReferences = references.trim();
    const cleanedNotes = notes.trim();

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        topic: topic.trim(),
        keyPoints: cleanedKeyPoints,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
        references: cleanedReferences || undefined,
        notes: cleanedNotes || undefined,
        templateId: selectedTemplate || undefined,
        brandVoiceId: selectedVoice || undefined,
      };

      const res = await fetch(`/api/content?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "创建失败");
        return;
      }

      const json = await res.json();
      const newId = json.data?.id;
      if (newId) {
        try {
          const generateRes = await fetch(`/api/content/${newId}/generate?projectId=${currentProjectId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: currentProjectId,
              topic: topic.trim(),
              keyPoints: cleanedKeyPoints,
              platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
              references: cleanedReferences || undefined,
              notes: cleanedNotes || undefined,
              templateId: selectedTemplate || undefined,
              brandVoiceId: selectedVoice || undefined,
            }),
          });
          if (!generateRes.ok) {
            const data = await generateRes.json().catch(() => ({}));
            alert(data.error || "内容生成失败，请稍后重试");
            return;
          }
        } catch {
          alert("内容生成请求失败，请稍后重试");
          return;
        }
        router.push(`/content/${newId}/edit`);
      } else {
        router.push("/content");
      }
    } catch {
      alert("网络错误");
    } finally {
      setSubmitting(false);
    }
  }, [currentProjectId, topic, keyPoints, selectedPlatforms, references, notes, selectedTemplate, selectedVoice, submitting, router]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/content"
          className="dashboard-icon-button"
          style={{ textDecoration: "none" }}
        >
          <ArrowLeft size={16} />
        </Link>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          新建内容
        </h1>
      </div>

      <div className="space-y-5">
        <div>
          <label
            className="dashboard-field-label"
          >
            内容主题 <span style={{ color: "var(--color-primary)" }}>*</span>
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：如何提升 AI 搜索推荐场景下的品牌可见性"
            className="dashboard-input px-3 py-2 text-sm"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        <div>
          <label className="dashboard-field-label">
            核心要点
          </label>
          <div className="space-y-2">
            {keyPoints.map((point, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={point}
                  onChange={(e) => updateKeyPoint(i, e.target.value)}
                  placeholder={`要点 ${i + 1}`}
                  className="dashboard-input px-3 py-2 text-sm"
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                {keyPoints.length > 1 && (
                  <button
                    onClick={() => removeKeyPoint(i)}
                    className="dashboard-icon-button shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addKeyPoint}
            className="dashboard-button dashboard-button--secondary mt-2"
          >
            <Plus size={14} />
            添加要点
          </button>
        </div>

        <div>
          <label className="dashboard-field-label">
            目标平台
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className="dashboard-chip"
                  style={{ background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--bg-card)", color: active ? "var(--color-primary)" : "var(--text-secondary)", border: `1px solid ${active ? "var(--color-primary)" : "var(--border)"}`, cursor: "pointer" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {templates.length > 0 && (
          <div>
          <label className="dashboard-field-label">
            <LayoutTemplate size={13} className="inline mr-1" />
            内容模板
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="dashboard-input px-3 py-2 text-sm"
            style={{ ...inputStyle, appearance: "auto" }}
          >
              <option value="">不使用模板</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.category ? ` (${t.category})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {voices.length > 0 && (
          <div>
          <label className="dashboard-field-label">
            <Mic size={13} className="inline mr-1" />
            品牌声音
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="dashboard-input px-3 py-2 text-sm"
            style={{ ...inputStyle, appearance: "auto" }}
          >
              <option value="">默认声音</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.toneKeywords?.length ? ` - ${v.toneKeywords.join(", ")}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="dashboard-button dashboard-button--secondary self-start"
        >
          {showAdvanced ? "收起高级选项" : "展开高级选项"}
        </button>

        {showAdvanced && (
          <div className="dashboard-surface dashboard-surface--padded space-y-4">
            <div>
              <label className="dashboard-field-label">
                参考资料
              </label>
              <textarea
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="粘贴参考文章、来源链接或素材摘要..."
                rows={3}
                className="dashboard-input px-3 py-2 text-sm"
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
            <div>
              <label className="dashboard-field-label">
                备注
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="对 AI 生成内容的额外要求、审计依据或成功指标..."
                rows={4}
                className="dashboard-input px-3 py-2 text-sm"
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !topic.trim()}
          className="dashboard-button dashboard-button--primary px-5 py-2.5"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {submitting ? "AI 生成中..." : "AI 生成内容"}
        </button>
        <Link
          href="/content"
          className="dashboard-button dashboard-button--secondary px-4 py-2.5"
          style={{ textDecoration: "none" }}
        >
          取消
        </Link>
      </div>
    </div>
  );
}

export default function NewContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-2xl">
          <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
          <div className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />
        </div>
      }
    >
      <NewContentInner />
    </Suspense>
  );
}
