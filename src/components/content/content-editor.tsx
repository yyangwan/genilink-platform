"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
} from "lucide-react";

interface ContentEditorProps {
  initialContent?: string;
  onUpdate?: (html: string) => void;
  placeholder?: string;
  editorRef?: React.MutableRefObject<ReturnType<typeof useEditor> | null>;
}

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
  color: "var(--color-primary)",
};

function ToolbarButton({
  icon: Icon,
  onClick,
  isActive,
  title,
}: {
  icon: React.ElementType;
  onClick: () => void;
  isActive?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={isActive ? btnActive : btnBase}
      title={title}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={15} />
    </button>
  );
}

export function ContentEditor({
  initialContent = "",
  onUpdate,
  placeholder = "开始输入内容，或使用 AI 生成...",
  editorRef,
}: ContentEditorProps) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved">("saved");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        style:
          "min-height: 300px; outline: none; padding: 16px; font-family: var(--font-body); font-size: 15px; line-height: 1.7; color: var(--text-primary);",
      },
    },
    onUpdate: ({ editor }) => {
      setSaveStatus("unsaved");
      onUpdate?.(editor.getHTML());
    },
  });

  // Expose editor instance to parent via ref
  React.useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  // Keep the editor in sync with async loads and tab switches without
  // clobbering in-flight edits when the HTML already matches.
  useEffect(() => {
    if (!editor) return;

    const currentContent = editor.getHTML();
    if (initialContent !== currentContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor, initialContent]);

  // Auto-save indicator reset
  useEffect(() => {
    if (saveStatus === "unsaved") {
      const t = setTimeout(() => setSaveStatus("saved"), 1500);
      return () => clearTimeout(t);
    }
  }, [saveStatus]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    setSaveStatus("saved");
    onUpdate?.(editor.getHTML());
  }, [editor, onUpdate]);

  if (!editor) return null;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-3 py-2 flex-wrap"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <ToolbarButton
          icon={Bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="粗体"
        />
        <ToolbarButton
          icon={Italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="斜体"
        />
        <ToolbarButton
          icon={Heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="标题"
        />
        <ToolbarButton
          icon={List}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="无序列表"
        />
        <ToolbarButton
          icon={ListOrdered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="有序列表"
        />
        <ToolbarButton
          icon={Quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="引用"
        />
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
        <ToolbarButton
          icon={Undo}
          onClick={() => editor.chain().focus().undo().run()}
          title="撤销"
        />
        <ToolbarButton
          icon={Redo}
          onClick={() => editor.chain().focus().redo().run()}
          title="重做"
        />

        {/* Save status */}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          {saveStatus === "unsaved" ? "未保存" : "已保存"}
        </div>
      </div>

      {/* Editor */}
      <div style={{ background: "var(--bg-base)" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
