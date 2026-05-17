"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Icon className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
      <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        {title}
      </p>
      <p className="text-sm mb-3 text-center max-w-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
        {description}
      </p>
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <Link
            href={actionHref}
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
          >
            {actionLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", background: "none", border: "none", cursor: "pointer" }}
          >
            {actionLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )
      )}
    </div>
  );
}
