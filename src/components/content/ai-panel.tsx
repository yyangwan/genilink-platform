"use client";

import React, { useState, useRef } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";

interface AIPanelProps {
  projectId: string;
  topic?: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function AIPanel({ projectId, topic, onInsert, onClose }: AIPanelProps) {
  const [prompt, setPrompt] = useState(topic ?? "");
  const [streaming, setStreaming] = useState(false);
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setStreaming(true);
    setGenerated("");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/content?projectId=" + projectId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });

      // If the upstream returns SSE
      if (res.headers.get("Content-Type")?.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let text = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // Parse SSE data lines
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.text) {
                    text += data.text;
                    setGenerated(text);
                  }
                } catch {
                  // Non-JSON data line, skip
                }
              }
            }
          }
        }
        setGenerated(text);
      } else {
        // JSON response
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "生成失败");
        } else {
          setGenerated(data.data?.content ?? data.data?.text ?? "");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("生成失败，请重试");
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div
      className="fixed right-0 top-0 h-full z-50 flex"
      style={{ width: 420 }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        style={{ background: "rgba(0,0,0,0.3)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="relative ml-auto flex flex-col h-full"
        style={{
          width: 420,
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--color-primary)" }} />
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
            >
              AI 助手
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              ...btnBase,
              width: 28,
              height: 28,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Input */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要生成的内容..."
            rows={3}
            style={{
              width: "100%",
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "var(--font-body)",
              color: "var(--text-primary)",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div className="flex justify-end mt-2">
            {streaming ? (
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-body)",
                }}
              >
                <Loader2 size={13} className="animate-spin" />
                停止
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
                style={{
                  background: "var(--color-primary)",
                  color: "white",
                  border: "none",
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                <Sparkles size={13} />
                生成
              </button>
            )}
          </div>
        </div>

        {/* Output */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {error && (
            <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>
              {error}
            </p>
          )}
          {generated && (
            <div>
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", lineHeight: 1.7 }}
              >
                {generated}
              </p>
              <button
                onClick={() => onInsert(generated)}
                className="mt-3 text-sm font-medium px-3 py-1.5 rounded-md"
                style={{
                  background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                  color: "var(--color-primary)",
                  border: "none",
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                插入到编辑器
              </button>
            </div>
          )}
          {!generated && !error && !streaming && (
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              输入描述后点击生成，AI 将为你撰写内容
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
  borderRadius: "var(--radius-md)",
};
