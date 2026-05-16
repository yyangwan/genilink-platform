# Design System — GeniLink (智链)

## Product Context
- **What this is:** Chinese GEO (Generative Engine Optimization) full-chain platform — AI search visibility tracking + content creation + unified portal
- **Who it's for:** Enterprise marketing teams (insurance, finance) managing brand visibility across Chinese AI platforms
- **Space/industry:** Chinese GEO/SaaS analytics — competitors include 犀帆 (Seenify)
- **Project type:** B2B web app (dashboard + analytics + content management)

## Aesthetic Direction
- **Direction:** Stratified Precision — layered dark surfaces with visible depth, not flat, not glassy
- **Decoration level:** Intentional — every visual element earns its place. Subtle surface depth through layered shadows and hairline borders
- **Mood:** Quiet command center — where decisions happen, not where meetings happen. Intelligence at work.
- **Memorable thing:** "Intelligence at work" — smart, AI-powered, intelligent. The AI that understands your brand.

## Typography
- **Display/Hero:** Sora — geometric but warm. Distinctive `a` and `g` cuts. No one in Chinese B2B uses it. Conveys precision without coldness.
- **Body (Latin):** Plus Jakarta Sans — slightly rounded, pairs well with Sora. Great readability at 13-14px.
- **Body (Chinese):** Noto Sans SC — invisible reliability for Chinese text. Keep it.
- **Data/Tables:** JetBrains Mono — tabular-nums for metrics. Numbers feel authoritative, not decorative.
- **Loading:** Google Fonts CDN (`Sora:wght@400;500;600;700`, `Plus+Jakarta+Sans:wght@400;500;600`, `Noto+Sans+SC:wght@400;500;600`, `JetBrains+Mono:wght@400;500`)
- **Scale:** All sizes in px, matching established 智见 system:
  - 11px — Overline / Metric Label / Tab (Sora 500, uppercase, +0.06em tracking)
  - 12px — Caption / Badge / Tag (Sora 500, +0.04em tracking)
  - 13px — Body Small / Table cells / Dense data (Plus Jakarta Sans / Noto Sans SC 400)
  - 14px — Body Default / UI text (Plus Jakarta Sans / Noto Sans SC 400, 1.6-1.8 line-height)
  - 16px — Body Large / Input labels (Plus Jakarta Sans / Noto Sans SC 500)
  - 20px — Card Title / Section heading (Sora 600, -0.01em tracking)
  - 28px — Section Heading / Dashboard title (Sora 600, -0.02em tracking)
  - 36px — Hero metric / Page title (Sora 700, -0.02em tracking)

## Color
- **Approach:** Balanced — teal primary for actions, violet AI accent for intelligence features
- **Primary:** `#00d4aa` — established GeniLink teal. CTAs, key actions, active states. Hover: `#00e8bb`
- **AI Accent:** `#7c6aef` — marks AI-powered features, "thinking" states, AI insights. Hover: `#9b8af5`. Never used as background wash — only in targeted UI elements.
- **Dark neutrals:**
  - Base: `#0b0d14` (main canvas)
  - Card: `#12151f` (cards, panels)
  - Elevated: `#1a1e2e` (hovered cards, dropdowns)
  - Hover: `#222840` (interactive hover states)
  - Input: `#0e1019` (form inputs)
- **Light neutrals:**
  - Base: `#f5f6fa` (main canvas)
  - Card: `#ffffff` (cards, panels)
  - Depressed: `#ebedf3` (pressed states)
  - Input: `#f0f1f5` (form inputs)
- **Text (dark mode):**
  - Primary: `#e4e4e7` (headings, key content)
  - Secondary: `#8b8fa3` (body text, descriptions)
  - Muted: `#4a4f6a` (labels, metadata, placeholders)
- **Text (light mode):**
  - Primary: `#111827`
  - Secondary: `#4b5563`
  - Muted: `#9ca3af`
- **Semantic:** success `#34d399`, warning `#fbbf24`, error `#ef4444`, info `#60a5fa`
- **Borders:** Dark mode `rgba(255,255,255,0.06)` default / `rgba(255,255,255,0.10)` strong. Light mode `rgba(0,0,0,0.06)` / `rgba(0,0,0,0.10)`
- **Dark mode strategy:** Default theme. Light mode is a full invert with adjusted contrast — primary shifts to `#00a88a`, AI accent to `#6c4fe0`, surfaces to warm whites.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — data-dense tables but breathing top-level views
- **Scale:**
  - 2xs: 4px
  - xs: 8px
  - sm: 12px
  - md: 16px
  - lg: 20px
  - xl: 24px
  - 2xl: 28px
  - 3xl: 32px
  - 4xl: 40px (section gaps)
  - 5xl: 48px (major sections)
  - 6xl: 64px (page sections)
- **Layout rules:** Top-level dashboard uses 24px minimum card padding and 32px section gaps. Data tables use 12-16px cell padding.

## Layout
- **Approach:** Hybrid — grid-disciplined for data views, generous whitespace for top-level views
- **Grid:** 12-column grid for desktop, 8-column for tablet, 4-column for mobile
- **Sidebar:** 220px fixed width, collapsible on mobile. Brand logo + project switcher + nav items.
- **Max content width:** 1200px
- **Border radius:** sm: 4px, md: 8px, lg: 12px, xl: 16px, full: 9999px

## Motion
- **Approach:** Intentional — every animation serves comprehension or feedback
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out. Default: `cubic-bezier(0.4, 0, 0.2, 1)`
- **Duration:**
  - micro: 50-100ms (hover states, button feedback)
  - short: 120-200ms (dropdowns, tooltips, card hover)
  - medium: 250-400ms (page transitions, sidebar collapse)
  - long: 400-700ms (modals, complex transitions)
- **AI "thinking" indicator:** Subtle 3-4s hue shift between teal and violet on card borders (10% opacity). CSS-only via `conic-gradient` animation. Only appears during AI processing, never statically.

## Login Methods
- Phone + SMS verification (primary)
- WeChat OAuth
- Email + password

## Responsive Breakpoints
- Mobile: < 768px (sidebar hidden, single column)
- Tablet: 768px - 1024px (sidebar collapsed, 2-column grid)
- Desktop: > 1024px (full sidebar, 12-column grid)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-14 | Initial design system created | Created by /design-consultation. Evolved from 智见's dark theme. Sora chosen over Inter for visual distinction. Violet AI accent adds intelligence signaling. Breathing dashboard top-level serves "intelligence at work" promise. |
