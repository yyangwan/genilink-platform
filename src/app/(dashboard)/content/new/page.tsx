"use client";

import React, { Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { ContentEditor } from "@/components/content/content-editor";

const AIPanel = dynamic(
  () => import("@/components/content/ai-panel").then((mod) => ({ default: mod.AIPanel })),
  { ssr: false },
);

function NewContentInner() {
  const { currentProjectId } = useProject();
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic") ?? undefined;
  const [content, setContent] = useState("");
  const [showAI, setShowAI] = useState(false);
  const [editorRef, setEditorRef] = useState<any>(null);

  const handleInsert = useCallback((text: string) => {
    // Append to editor content
    setContent((prev) => prev + text);
  }, []);

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
              新建内容
            </h1>
            {topic && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                主题: {topic}
              </p>
            )}
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

      {/* Editor */}
      <ContentEditor
        initialContent={content}
        onUpdate={setContent}
        placeholder={topic ? `围绕「${topic}」撰写内容...` : "开始输入内容，或使用 AI 生成..."}
      />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          className="text-sm font-medium px-4 py-2 rounded-lg"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          保存草稿
        </button>
        <button
          className="text-sm font-medium px-4 py-2 rounded-lg"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          保存并发布
        </button>
      </div>

      {/* AI Panel overlay */}
      {showAI && currentProjectId && (
        <AIPanel
          projectId={currentProjectId}
          topic={topic}
          onInsert={handleInsert}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}

export default function NewContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-4xl">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <NewContentInner />
    </Suspense>
  );
}
