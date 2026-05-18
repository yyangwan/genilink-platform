"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="面包屑导航" className="flex items-center gap-1">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
            )}
            {isLast || !item.href ? (
              <span
                className="text-xs font-medium"
                style={{
                  color: isLast ? "var(--text-primary)" : "var(--text-muted)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-xs font-medium transition-colors"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-display)",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
