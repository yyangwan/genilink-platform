# Design System - GeniLink

## Purpose
- Product: Chinese GEO platform for visibility tracking, content operations, and unified workspace management.
- Audience: B2B marketing teams that need dense data views, reliable workflows, and fast decision-making.
- Product feel: a quiet command center, not a consumer app. The UI should feel precise, layered, and operational.

## Source Of Truth
- Primary token source: [`packages/design-tokens/src/tokens.ts`](/E:/workspace/genilink-platform/packages/design-tokens/src/tokens.ts)
- CSS variable generator: [`packages/design-tokens/src/generate-css.ts`](/E:/workspace/genilink-platform/packages/design-tokens/src/generate-css.ts)
- App entry styles: [`src/app/globals.css`](/E:/workspace/genilink-platform/src/app/globals.css)
- Tailwind bridge: [`packages/design-tokens/src/tailwind-preset.ts`](/E:/workspace/genilink-platform/packages/design-tokens/src/tailwind-preset.ts)

The app consumes the generated CSS variables from `@genilink/design-tokens/dist/tokens.css`. `DESIGN.md` should describe what the code actually uses, not an aspirational style direction.

## Visual Direction
- Style: layered precision with visible depth.
- Surfaces: dark default theme with subtle elevation, soft shadows, and hairline borders.
- AI signal: violet accent is reserved for AI/analysis states and should stay targeted, not become a general brand wash.
- Tone: confident, restrained, technical.

## Typography
- Display font: `Sora`
- Body font: `Plus Jakarta Sans`
- Chinese font: `Noto Sans SC`
- Mono font: `JetBrains Mono`

### Type Scale
- `11px` - overline, metric labels, compact navigation labels
- `12px` - captions, badges, tags
- `13px` - dense body text, tables, metadata
- `14px` - default body copy
- `16px` - input labels, larger body copy
- `20px` - card titles, section headings in compact contexts
- `28px` - major section headings
- `36px` - page heroes and top-level metrics

### Typography Rules
- Use `Sora` for headings, navigation emphasis, and page-level titles.
- Use `Plus Jakarta Sans` / `Noto Sans SC` for readable body copy.
- Use `JetBrains Mono` for metrics, scores, IDs, dates, and table numbers.
- Keep letter spacing tight for large display text and slightly expanded for overlines and badges.

## Color System

### Brand
- Primary: `#00d4aa`
- Primary hover: `#00e8bb`
- Primary dim: `rgba(0, 212, 170, 0.12)`
- AI accent: `#7c6aef`
- AI accent hover: `#9b8af5`
- AI accent dim: `rgba(124, 106, 239, 0.12)`
- AI glow: `rgba(124, 106, 239, 0.25)`

### Surfaces
- Dark base: `#0b0d14`
- Dark card: `#12151f`
- Dark elevated: `#1a1e2e`
- Dark hover: `#222840`
- Dark input: `#0e1019`
- Dark sidebar: `#080a10`

- Light base: `#f5f6fa`
- Light card: `#ffffff`
- Light elevated: `#ffffff`
- Light hover: `#ebedf3`
- Light input: `#f0f1f5`
- Light sidebar: `#ffffff`

### Text
- Dark primary: `#e4e4e7`
- Dark secondary: `#8b8fa3`
- Dark muted: `#4a4f6a`
- Light primary: `#111827`
- Light secondary: `#4b5563`
- Light muted: `#9ca3af`

### Semantic
- Success: `#34d399` dark, `#065f46` light
- Warning: `#fbbf24` dark, `#d97706` light
- Error: `#ef4444` dark, `#b91c1c` light
- Info: `#60a5fa` dark, `#2563eb` light

### Borders And Shadows
- Border default: `rgba(255, 255, 255, 0.06)` dark, `rgba(0, 0, 0, 0.06)` light
- Border strong: `rgba(255, 255, 255, 0.10)` dark, `rgba(0, 0, 0, 0.10)` light
- Border sidebar: `rgba(255, 255, 255, 0.04)` dark, `rgba(0, 0, 0, 0.06)` light
- Shadow sm: `0 1px 2px`
- Shadow md: `0 4px 12px`
- Shadow lg: `0 8px 24px`

## Spacing
- Base unit: `4px`
- Scale:
  - `4px`
  - `8px`
  - `12px`
  - `16px`
  - `20px`
  - `24px`
  - `28px`
  - `32px`
  - `40px`
  - `48px`
  - `64px`

### Spacing Rules
- Page shells and dashboard views should use generous breathing room.
- Cards usually need `20px` to `24px` internal padding.
- Dense tables can use `12px` to `16px` cell padding.
- Keep vertical rhythm consistent across sections and forms.

## Layout
- Sidebar width: `220px`
- Collapsed sidebar width: `56px`
- Max content width: `1200px`
- Border radius:
  - `4px` small
  - `8px` medium
  - `12px` large
  - `16px` extra large
  - `9999px` full

### Breakpoints
- Mobile: `< 640px`
- Tablet: `640px` to `< 1024px`
- Desktop: `>= 1024px`

### Layout Behavior
- Mobile: sidebar hidden or minimized, single-column layouts.
- Tablet: sidebar collapsed, 2-column data layouts where useful.
- Desktop: full sidebar and 12-column dashboard grids.

## Motion
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- Micro: `100ms`
- Short: `200ms`
- Medium: `300ms`
- Long: `500ms`

### Motion Rules
- Use motion for feedback and comprehension, not decoration.
- Hover and focus transitions should feel immediate.
- Loading states may animate, but should remain subtle.
- Respect reduced-motion preferences.

## Interaction Patterns
- Focus ring: use the primary color with a clear outline offset.
- Hover states: raise or tint cards and buttons slightly, not aggressively.
- Empty states: explain what is missing and what to do next.
- Error states: be specific, actionable, and visually distinct.
- Loading states: skeletons or pulsing placeholders are preferred over spinners for page chrome.

## Component Language

### Cards
- Card background should usually be `var(--bg-card)`.
- Prefer hairline borders and subtle elevation.
- Keep card titles short and descriptive.

### Forms
- Inputs should use `var(--bg-input)` / `var(--bg-primary)` style surfaces depending on context.
- Labels should be readable, not decorative.
- Keep destructive actions visually separated from primary actions.

### Tables
- Tables are dense, ordered, and high contrast.
- Use `JetBrains Mono` for numeric data and scores.
- Highlight deltas with semantic colors, but avoid overusing color.

### Charts
- Charts should match the same semantic palette.
- Primary data should usually be teal.
- Comparisons and AI-related highlights may use the violet accent.

### Navigation
- Sidebar and breadcrumb labels should use the display font for hierarchy.
- Active states should be obvious but not loud.

## Accessibility
- Maintain WCAG AA contrast for text and status colors.
- Keep keyboard focus visible everywhere.
- Do not rely on color alone for meaning.
- Skip link should remain available and styled.
- Reduced motion must remove non-essential animation.

## Usage Guidelines
- Prefer the design tokens and CSS variables over ad hoc colors.
- Do not introduce new accent colors unless they map to a semantic role.
- Use violet only when the UI is explicitly AI/analysis/insight related.
- Keep pages operational and data-first; avoid ornamental layouts that slow down scanning.

## Notes For Future Work
- If the token system changes, update `packages/design-tokens/src/tokens.ts` first, then regenerate `dist/tokens.css`.
- If a new component pattern appears repeatedly in the app, document it here before it spreads.
- If you need a new visual style, prefer extending the current system rather than replacing it.
