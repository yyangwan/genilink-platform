"use client";

import React from "react";
import { CheckCircle2, Circle, Loader2, ExternalLink } from "lucide-react";

export interface DiagnosticItem {
  id: string;
  label: string;
  description?: string;
  status: "complete" | "incomplete" | "loading";
  actionLabel?: string;
  onAction?: () => void;
}

interface DiagnosticChecklistProps {
  items: DiagnosticItem[];
  title?: string;
}

export function DiagnosticChecklist({ items, title }: DiagnosticChecklistProps) {
  const allComplete = items.every((item) => item.status === "complete");

  if (allComplete) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
          borderRadius: "var(--radius-full)",
          fontSize: 13,
          color: "var(--color-success)",
          fontWeight: 500,
        }}
      >
        <CheckCircle2 size={14} />
        所有条件已满足
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 16,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item) => {
          const Icon =
            item.status === "complete"
              ? CheckCircle2
              : item.status === "loading"
                ? Loader2
                : Circle;
          const iconColor =
            item.status === "complete"
              ? "var(--color-success)"
              : item.status === "loading"
                ? "var(--color-primary)"
                : "var(--text-muted)";

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon
                size={18}
                style={{
                  color: iconColor,
                  flexShrink: 0,
                  ...(item.status === "loading" ? { animation: "spinner-rotate 1s linear infinite" } : {}),
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-primary)",
                    lineHeight: 1.3,
                  }}
                >
                  {item.label}
                </div>
                {item.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    {item.description}
                  </div>
                )}
              </div>
              {item.status === "incomplete" && item.actionLabel && (
                <button
                  onClick={item.onAction}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    background: "transparent",
                    border: "1px solid var(--color-primary)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-primary)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.actionLabel}
                  <ExternalLink size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
