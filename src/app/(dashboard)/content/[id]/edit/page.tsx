"use client";

import React, { Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useProject } from "@/components/project/project-context";
import { ContentEditor } from "@/components/content/content-editor";

const AIPanel = dynamic(
  () => import("@/components/content/ai-panel").then((mod) => ({ default: mod.AIPanel })),
  { ssr: false },
);

function EditContentInner({ id }: { id: string }) {
  const { currentProjectId } = useProject();
  const [content, setContent] = useState("");
  const [showAI, setShowAI] = useState(false);

  const handleInsert = useCallback((text: string) => {
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
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            编辑内容
          </h1>
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
          保存
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
          发布
        </button>
      </div>

      {/* AI Panel overlay */}
      {showAI && currentProjectId && (
        <AIPanel
          projectId={currentProjectId}
          onInsert={handleInsert}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}

export default function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
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
  // Need to unwrap params promise for Next.js 16
  const [id, setId] = React.useState<string>("");
  const [paramsResolved, setParamsResolved] = React.useState(false);

  // Use React.use() to unwrap the params promise
  const paramsPromise = React.use(React.useMemo(() => {
    // Get params from the URL directly since we can't access route params easily
    const path = window.location.pathname;
    const match = path.match(/\/content\/([^/]+)\/edit/);
    return Promise.resolve({ id: match?.[1] ?? "" });
  }, []));

  return <EditContentInner id={paramsPromise.id} />;
}
