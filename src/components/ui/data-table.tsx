"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyContent?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
}

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  overflow: "hidden",
};

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyContent,
  loading,
  loadingRows = 5,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div style={sectionCard}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-3"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                      width: col.width,
                    }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div
                        className="h-4 rounded animate-skeleton-pulse"
                        style={{ background: "var(--bg-hover)", width: "60%" }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyContent) {
    return <div style={sectionCard}>{emptyContent}</div>;
  }

  return (
    <div style={sectionCard}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-4 py-3"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={cn(onRowClick && "cursor-pointer")}
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: i % 2 === 1 ? "var(--bg-elevated)" : "transparent",
                  transition: "background var(--duration-short)",
                }}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = i % 2 === 1 ? "var(--bg-elevated)" : "transparent")
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--text-primary)",
                    }}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
