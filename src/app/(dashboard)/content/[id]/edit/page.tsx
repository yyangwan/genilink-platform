"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { ContentEditor } from "@/components/content/content-editor";

const AIPanel = dynamic(
  () => import("@/components/content/ai-panel").then((mod) => ({ default: mod.AIPanel })),
  { ssr: false },
);

interface ContentData {
  id: string;
  title: string;
  status: string;
  platformContents?: { id: string; platform: string; content: string; status: string }[];
  [key: string]: unknown;
}

function EditContentInner({ id }: { id: string }) {
  const { currentProjectId } = useProject();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const editorRef = React.useRef<ReturnType<typeof import("@tiptap/react").useEditor> | null>(null);

  // Fetch existing content on mount
  useEffect(() => {
    if (!id || !currentProjectId) return;

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/content/${id}?projectId=${currentProjectId}`);
        if (!res.ok) {
          setError(res.status === 404 ? "内容不存在" : "加载失败");
          return;
        }
        const json = await res.json();
        if (cancelled) return;

        const data: ContentData = json.data ?? json;
        setTitle(data.title ?? "");

        // Use first platformContent if available, otherwise fall back to empty
        const firstPlatform = data.platformContents?.[0];
        setContent(firstPlatform?.content ?? "");
      } catch {
        if (!cancelled) setError("网络错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, currentProjectId]);

  const handleInsert = useCallback((text: string) => {
    if (editorRef.current) {
      editorRef.current.commands.insertContent(text);
    } else {
      setContent((prev) => prev + text);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentProjectId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${id}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, title, content }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }, [id, currentProjectId, title, content, saving]);

  const handlePublish = useCallback(async () => {
    if (!currentProjectId || saving) return;
    setSaving(true);
    try {
      // Save first, then publish
      const saveRes = await fetch(`/api/content/${id}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, title, content }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json();
        setError(data.error || "保存失败");
        return;
      }
      const pubRes = await fetch(`/api/content/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!pubRes.ok) {
        const data = await pubRes.json();
        setError(data.error || "发布失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }, [id, currentProjectId, title, content, saving]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
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
            {error}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <div>
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              {title || "编辑内容"}
            </h1>
          </div>
        </div>
        <button
          onClick={() => setShowAI(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
          style={{
            background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
            color: "var(--color-primary)",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          <Sparkles size={14} />
          AI 助手
        </button>
      </div>

      {/* Title input */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        className="w-full"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 24,
          fontWeight: 600,
          fontFamily: "var(--font-display)",
          color: "var(--text-primary)",
          padding: 0,
        }}
      />

      {/* Editor */}
      <ContentEditor
        initialContent={content}
        onUpdate={setContent}
        editorRef={editorRef}
      />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          保存
        </button>
        <button
          onClick={handlePublish}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-body)",
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          发布
        </button>
      </div>

      {/* AI Panel overlay */}
      {showAI && currentProjectId && (
        <AIPanel
          projectId={currentProjectId}
          contentId={id}
          onInsert={handleInsert}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}

export default function EditContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-4xl">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <EditContentInnerWithParams />
    </Suspense>
  );
}

function EditContentInnerWithParams() {
  const params = useParams();
  return <EditContentInner id={params.id as string} />;
}
