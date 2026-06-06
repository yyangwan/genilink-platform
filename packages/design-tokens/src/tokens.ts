/**
 * GeniLink Design Tokens
 * Source of truth — DESIGN.md + design system preview
 */

// ─── Colors ───────────────────────────────────────────────

export const colors = {
  // Brand
  primary: "#00d4aa",
  primaryHover: "#00e8bb",
  primaryDim: "rgba(0, 212, 170, 0.12)",
  aiAccent: "#7c6aef",
  aiAccentHover: "#9b8af5",
  aiAccentDim: "rgba(124, 106, 239, 0.12)",
  aiGlow: "rgba(124, 106, 239, 0.25)",

  // Surfaces — Dark
  dark: {
    base: "#0b0d14",
    card: "#12151f",
    elevated: "#1a1e2e",
    hover: "#222840",
    input: "#0e1019",
    sidebar: "#080a10",
  },

  // Surfaces — Light
  light: {
    base: "#f5f6fa",
    card: "#ffffff",
    elevated: "#ffffff",
    hover: "#ebedf3",
    input: "#f0f1f5",
    sidebar: "#ffffff",
  },

  // Text — Dark
  textDark: {
    primary: "#e4e4e7",
    secondary: "#8b8fa3",
    muted: "#4a4f6a",
  },

  // Text — Light
  textLight: {
    primary: "#111827",
    secondary: "#4b5563",
    muted: "#9ca3af",
  },

  // Semantic
  success: "#34d399",
  warning: "#fbbf24",
  error: "#ef4444",
  info: "#60a5fa",

  // Light theme semantic (darker for AA contrast on light surfaces)
  lightSuccess: "#065f46",
  lightWarning: "#d97706",
  lightError: "#b91c1c",
  lightInfo: "#2563eb",

  // Borders
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.10)",
  borderLight: "rgba(0, 0, 0, 0.06)",
  borderStrongLight: "rgba(0, 0, 0, 0.10)",
  sidebarBorder: "rgba(255, 255, 255, 0.04)",
  sidebarBorderLight: "rgba(0, 0, 0, 0.06)",
} as const;

// ─── Typography ───────────────────────────────────────────

export const fonts = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Plus Jakarta Sans', 'Noto Sans SC', system-ui, sans-serif",
  chinese: "'Noto Sans SC', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const fontSizes = {
  overline: "11px",
  caption: "12px",
  bodySmall: "13px",
  body: "14px",
  bodyLarge: "16px",
  cardTitle: "20px",
  sectionHeading: "28px",
  heroMetric: "36px",
} as const;

export const lineHeights = {
  tight: 1.3,
  normal: 1.6,
  relaxed: 1.7,
  chinese: 1.8,
} as const;

export const letterSpacing = {
  overline: "0.06em",
  caption: "0.04em",
  cardTitle: "-0.01em",
  sectionHeading: "-0.02em",
  heroMetric: "-0.02em",
} as const;

// ─── Spacing ──────────────────────────────────────────────

export const spacing = {
  "2xs": "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "20px",
  xl: "24px",
  "2xl": "28px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "48px",
  "6xl": "64px",
} as const;

// ─── Radius ───────────────────────────────────────────────

export const radii = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
} as const;

// ─── Shadows ──────────────────────────────────────────────

export const shadows = {
  dark: {
    sm: "0 1px 2px rgba(0,0,0,0.3)",
    md: "0 4px 12px rgba(0,0,0,0.4)",
    lg: "0 8px 24px rgba(0,0,0,0.5)",
  },
  light: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 12px rgba(0,0,0,0.08)",
    lg: "0 8px 24px rgba(0,0,0,0.12)",
  },
} as const;

// ─── Z-Index ──────────────────────────────────────────────

export const zIndex = {
  sidebar: "100",
  modal: "200",
  toast: "300",
  tooltip: "400",
} as const;

// ─── Breakpoints ──────────────────────────────────────────

export const breakpoints = {
  mobile: "640px",
  tablet: "768px",
  desktop: "1024px",
} as const;

// ─── Motion ───────────────────────────────────────────────

export const motion = {
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  micro: "100ms",
  short: "200ms",
  medium: "300ms",
  long: "500ms",
} as const;

// ─── Layout ───────────────────────────────────────────────

export const layout = {
  sidebarWidth: "220px",
  sidebarCollapsedWidth: "56px",
  maxContentWidth: "1200px",
} as const;
