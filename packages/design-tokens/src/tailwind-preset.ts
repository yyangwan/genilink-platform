/**
 * Tailwind CSS v4 preset for GeniLink services.
 *
 * Usage in globals.css:
 *   @import "@genilink/design-tokens/tailwind";
 *
 * Or in tailwind.config.ts (v3):
 *   import { genilinkPreset } from "@genilink/design-tokens/tailwind";
 *   module.exports = { presets: [genilinkPreset] };
 */

import type { Config } from "tailwindcss";
import {
  colors,
  radii,
  spacing,
  zIndex,
  breakpoints,
  layout,
} from "./tokens";

const preset: Config = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: colors.primary,
          hover: colors.primaryHover,
          dim: colors.primaryDim,
        },
        "ai-accent": {
          DEFAULT: colors.aiAccent,
          hover: colors.aiAccentHover,
          dim: colors.aiAccentDim,
          glow: colors.aiGlow,
        },
        surface: {
          base: "var(--bg-base)",
          card: "var(--bg-card)",
          elevated: "var(--bg-elevated)",
          hover: "var(--bg-hover)",
          input: "var(--bg-input)",
          sidebar: "var(--bg-sidebar)",
        },
        semantic: {
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error: "var(--color-error)",
          info: "var(--color-info)",
        },
        txt: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        edge: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          sidebar: "var(--border-sidebar)",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        xl: radii.xl,
        full: radii.full,
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([k, v]) => [`gl-${k}`, v])
      ),
      zIndex: Object.fromEntries(
        Object.entries(zIndex).map(([k, v]) => [k, parseInt(v)])
      ),
      screens: {
        mobile: breakpoints.mobile,
        tablet: breakpoints.tablet,
        desktop: breakpoints.desktop,
      },
      maxWidth: {
        content: layout.maxContentWidth,
      },
    },
  },
};

export default preset;
