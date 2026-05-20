"use client";

import React from "react";
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useToast } from "./toast-context";

const typeConfig = {
  success: { color: "var(--color-success)", Icon: CheckCircle2 },
  error: { color: "var(--color-error)", Icon: XCircle },
  warning: { color: "var(--color-warning)", Icon: AlertTriangle },
  info: { color: "var(--color-primary)", Icon: Info },
};

export function ToastRenderer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 380,
        pointerEvents: "none",
      }}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const config = typeConfig[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 16px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)",
              borderLeft: `3px solid ${config.color}`,
              animation: "toast-slide-in var(--duration-medium) var(--ease)",
              position: "relative",
            }}
            role="status"
          >
            <config.Icon
              size={18}
              style={{ color: config.color, flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
                {toast.title}
              </div>
              {toast.description && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {toast.description}
                </div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
