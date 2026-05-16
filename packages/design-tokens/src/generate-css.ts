/**
 * Generate CSS custom properties from design tokens.
 * Outputs dual dark/light themes.
 */

import {
  colors,
  fonts,
  radii,
  spacing,
  shadows,
  zIndex,
  breakpoints,
  motion,
  layout,
  fontSizes,
} from "./tokens";

function generateCSS(): string {
  const lines: string[] = [];

  lines.push("/* ========================================");
  lines.push("   @genilink/design-tokens");
  lines.push("   Auto-generated from tokens.ts");
  lines.push("   ======================================== */");
  lines.push("");

  // ── Dark theme (default) ──
  lines.push(":root {");
  lines.push("  /* Colors — Brand */");
  lines.push(`  --color-primary: ${colors.primary};`);
  lines.push(`  --color-primary-hover: ${colors.primaryHover};`);
  lines.push(`  --color-primary-dim: ${colors.primaryDim};`);
  lines.push(`  --color-ai-accent: ${colors.aiAccent};`);
  lines.push(`  --color-ai-accent-hover: ${colors.aiAccentHover};`);
  lines.push(`  --color-ai-accent-dim: ${colors.aiAccentDim};`);
  lines.push(`  --color-ai-glow: ${colors.aiGlow};`);
  lines.push("");
  lines.push("  /* Colors — Surfaces */");
  lines.push(`  --bg-base: ${colors.dark.base};`);
  lines.push(`  --bg-card: ${colors.dark.card};`);
  lines.push(`  --bg-elevated: ${colors.dark.elevated};`);
  lines.push(`  --bg-hover: ${colors.dark.hover};`);
  lines.push(`  --bg-input: ${colors.dark.input};`);
  lines.push(`  --bg-sidebar: ${colors.dark.sidebar};`);
  lines.push("");
  lines.push("  /* Colors — Text */");
  lines.push(`  --text-primary: ${colors.textDark.primary};`);
  lines.push(`  --text-secondary: ${colors.textDark.secondary};`);
  lines.push(`  --text-muted: ${colors.textDark.muted};`);
  lines.push("");
  lines.push("  /* Colors — Semantic */");
  lines.push(`  --color-success: ${colors.success};`);
  lines.push(`  --color-warning: ${colors.warning};`);
  lines.push(`  --color-error: ${colors.error};`);
  lines.push(`  --color-info: ${colors.info};`);
  lines.push("");
  lines.push("  /* Borders */");
  lines.push(`  --border: ${colors.border};`);
  lines.push(`  --border-strong: ${colors.borderStrong};`);
  lines.push(`  --border-sidebar: ${colors.sidebarBorder};`);
  lines.push("");
  lines.push("  /* Shadows */");
  lines.push(`  --shadow-sm: ${shadows.dark.sm};`);
  lines.push(`  --shadow-md: ${shadows.dark.md};`);
  lines.push(`  --shadow-lg: ${shadows.dark.lg};`);
  lines.push("");
  lines.push("  /* Z-Index */");
  for (const [k, v] of Object.entries(zIndex)) {
    lines.push(`  --z-${k}: ${v};`);
  }
  lines.push("}");

  // ── Light theme ──
  lines.push("");
  lines.push("[data-theme='light'] {");
  lines.push("  /* Surfaces */");
  lines.push(`  --bg-base: ${colors.light.base};`);
  lines.push(`  --bg-card: ${colors.light.card};`);
  lines.push(`  --bg-elevated: ${colors.light.elevated};`);
  lines.push(`  --bg-hover: ${colors.light.hover};`);
  lines.push(`  --bg-input: ${colors.light.input};`);
  lines.push(`  --bg-sidebar: ${colors.light.sidebar};`);
  lines.push("");
  lines.push("  /* Brand — adjusted for light backgrounds */");
  lines.push(`  --color-primary: #00a88a;`);
  lines.push(`  --color-primary-hover: #00c4a2;`);
  lines.push(`  --color-primary-dim: rgba(0, 168, 138, 0.08);`);
  lines.push(`  --color-ai-accent: #6c4fe0;`);
  lines.push(`  --color-ai-accent-hover: #8a70e8;`);
  lines.push(`  --color-ai-accent-dim: rgba(108, 79, 224, 0.08);`);
  lines.push(`  --color-ai-glow: rgba(108, 79, 224, 0.15);`);
  lines.push("");
  lines.push("  /* Text */");
  lines.push(`  --text-primary: ${colors.textLight.primary};`);
  lines.push(`  --text-secondary: ${colors.textLight.secondary};`);
  lines.push(`  --text-muted: ${colors.textLight.muted};`);
  lines.push("");
  lines.push("  /* Semantic */");
  lines.push(`  --color-success: ${colors.lightSuccess};`);
  lines.push(`  --color-warning: ${colors.lightWarning};`);
  lines.push(`  --color-error: ${colors.lightError};`);
  lines.push(`  --color-info: ${colors.lightInfo};`);
  lines.push("");
  lines.push("  /* Borders */");
  lines.push(`  --border: ${colors.borderLight};`);
  lines.push(`  --border-strong: ${colors.borderStrongLight};`);
  lines.push(`  --border-sidebar: ${colors.sidebarBorderLight};`);
  lines.push("");
  lines.push("  /* Shadows */");
  lines.push(`  --shadow-sm: ${shadows.light.sm};`);
  lines.push(`  --shadow-md: ${shadows.light.md};`);
  lines.push(`  --shadow-lg: ${shadows.light.lg};`);
  lines.push("}");

  // ── Shared (not theme-dependent) ──
  lines.push("");
  lines.push(":root {");
  lines.push("  /* Typography */");
  lines.push(`  --font-display: ${fonts.display};`);
  lines.push(`  --font-body: ${fonts.body};`);
  lines.push(`  --font-chinese: ${fonts.chinese};`);
  lines.push(`  --font-mono: ${fonts.mono};`);
  lines.push("");
  lines.push("  /* Font Sizes */");
  for (const [k, v] of Object.entries(fontSizes)) {
    lines.push(`  --text-${k}: ${v};`);
  }
  lines.push("");
  lines.push("  /* Spacing */");
  for (const [k, v] of Object.entries(spacing)) {
    lines.push(`  --space-${k}: ${v};`);
  }
  lines.push("");
  lines.push("  /* Radius */");
  for (const [k, v] of Object.entries(radii)) {
    lines.push(`  --radius-${k}: ${v};`);
  }
  lines.push("");
  lines.push("  /* Motion */");
  lines.push(`  --ease: ${motion.easing};`);
  lines.push(`  --duration-micro: ${motion.micro};`);
  lines.push(`  --duration-short: ${motion.short};`);
  lines.push(`  --duration-medium: ${motion.medium};`);
  lines.push(`  --duration-long: ${motion.long};`);
  lines.push("");
  lines.push("  /* Layout */");
  lines.push(`  --sidebar-width: ${layout.sidebarWidth};`);
  lines.push(`  --sidebar-collapsed: ${layout.sidebarCollapsedWidth};`);
  lines.push(`  --max-content: ${layout.maxContentWidth};`);
  lines.push("");
  lines.push("  /* Breakpoints */");
  for (const [k, v] of Object.entries(breakpoints)) {
    lines.push(`  --bp-${k}: ${v};`);
  }
  lines.push("}");

  return lines.join("\n");
}

// Write to stdout for build scripts, or export for programmatic use
export { generateCSS };

// CLI: node dist/generate-css.js > dist/tokens.css
if (typeof require !== "undefined" && require.main === module) {
  console.log(generateCSS());
}
