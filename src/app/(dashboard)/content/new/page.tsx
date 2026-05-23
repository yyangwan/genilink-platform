"use client";

import React, { Suspense, useCallback, useState } from "react";
import { ArrowLeft, Plus, X, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useProject } from "@/components/project/project-context";

const PLATFORMS = [
  { id: "wechat", label: "微信公众号" },
  { id: "weibo", label: "微博" },
  { id: "douyin", label: "抖音" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "toutiao", label: "今日头条" },
  { id: "zhihu", label: "知乎" },
] as const;

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

function NewContentInner() {
  const { currentProjectId } = useProject();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [keyPoints, setKeyPoints] = useState<string[]>([""]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [references, setReferences] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        topic: topic.trim(),
        keyPoints: keyPoints.filter((p) => p.trim()),
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
        references: references.trim() || undefined,
        notes: notes.trim() || undefined,
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
      router.push(newId ? `/content/${newId}/edit` : "/content");
    } catch {
      alert("网络错误");
    } finally {
      setSubmitting(false);
    }
  }, [currentProjectId, topic, keyPoints, selectedPlatforms, references, notes, submitting, router]);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/content"
          className="inline-flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
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

      {/* Brief Form */}
      <div className="space-y-5">
        {/* Topic */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            内容主题 <span style={{ color: "var(--color-primary)" }}>*</span>
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：如何打造高转化率的社交媒体内容"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Key Points */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            核心要点
          </label>
          <div className="space-y-2">
            {keyPoints.map((point, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={point}
                  onChange={(e) => updateKeyPoint(i, e.target.value)}
                  placeholder={`要点 ${i + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                {keyPoints.length > 1 && (
                  <button
                    onClick={() => removeKeyPoint(i)}
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addKeyPoint}
            className="mt-2 inline-flex items-center gap-1 text-sm"
            style={{
              color: "var(--color-primary)",
              background: "transparent",
              border: "none",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Plus size={14} />
            添加要点
          </button>
        </div>

        {/* Platforms */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            目标平台
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className="text-sm px-3 py-1.5 rounded-full"
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                      : "var(--bg-primary)",
                    color: active ? "var(--color-primary)" : "var(--text-secondary)",
                    border: `1px solid ${active ? "var(--color-primary)" : "var(--border)"}`,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* References */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            参考资料
          </label>
          <textarea
            value={references}
            onChange={(e) => setReferences(e.target.value)}
            placeholder="粘贴参考文章链接或内容..."
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Notes */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          >
            备注
          </label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="对 AI 生成内容的额外要求..."
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !topic.trim()}
          className="text-sm font-medium px-5 py-2.5 rounded-lg inline-flex items-center gap-2"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting || !topic.trim() ? 0.6 : 1,
          }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          生成内容
        </button>
        <Link
          href="/content"
          className="text-sm font-medium px-4 py-2.5 rounded-lg"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-body)",
            textDecoration: "none",
          }}
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
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <NewContentInner />
    </Suspense>
  );
}
