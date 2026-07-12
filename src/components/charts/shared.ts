/**
 * Shared chart styling constants.
 * Single source of truth for tooltip, axis, grid, and legend styles
 * across all Recharts components.
 */

export const tooltipStyles = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  color: "var(--text-primary)",
} as const;

export const axisTickStyles = {
  fontSize: 11,
  fill: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
} as const;

export const axisLineStyles = {
  stroke: "var(--border)",
} as const;

export const tickLineStyles = {
  stroke: "var(--border)",
} as const;

export const gridStyles = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
} as const;

export const legendStyles = {
  fontSize: 12,
  fontFamily: "var(--font-body)",
} as const;

export const chartMargin = { top: 5, right: 20, left: 0, bottom: 5 } as const;

export const PLATFORM_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f472b6",
] as const;

export const BRAND_COLORS = [
  "#00d4aa",
  "#4cc9f0",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f472b6",
  "#6366f1",
  "#22c55e",
] as const;

/**
 * Shared section card style used across dashboard pages.
 */
export const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "24px",
} as const;
