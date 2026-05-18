"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import type { Notification } from "@/types/visibility";

interface NotificationDropdownProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationDropdown({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const typeIcons: Record<string, string> = {
    audit_completed: "✓",
    suggestion_generated: "✦",
    score_change: "↑",
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
        style={{
          background: open ? "var(--bg-elevated)" : "transparent",
          color: "var(--text-secondary)",
          border: "none",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 条未读)` : ""}`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold"
            style={{
              background: "var(--color-primary)",
              color: "#0b0d14",
              fontFamily: "var(--font-display)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-[320px] rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            maxHeight: 400,
          }}
          role="menu"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span
              className="text-sm font-medium"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              通知
            </span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs font-medium"
                style={{
                  color: "var(--color-primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                全部已读
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  暂无通知
                </span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    onMarkRead(n.id);
                    if (n.action_url) window.location.href = n.action_url!;
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                  style={{
                    background: n.read ? "transparent" : "var(--color-primary-dim)",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    borderLeft: "none",
                    borderRight: "none",
                    borderTop: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = n.read ? "transparent" : "var(--color-primary-dim)")
                  }
                >
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-xs"
                    style={{
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {typeIcons[n.type] || "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm truncate"
                      style={{
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-body)",
                        fontWeight: n.read ? 400 : 500,
                      }}
                    >
                      {n.title}
                    </p>
                    <p
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}
                    >
                      {n.message}
                    </p>
                  </div>
                  {!n.read && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                      style={{ background: "var(--color-primary)" }}
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
