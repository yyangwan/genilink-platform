"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div
      className="flex gap-1 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--border)" }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-4 py-2.5 text-xs font-medium uppercase tracking-wide transition-colors whitespace-nowrap",
              "duration-[var(--duration-short)]"
            )}
            style={{
              fontFamily: "var(--font-display)",
              color: active ? "var(--color-primary)" : "var(--text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: "-1px",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
