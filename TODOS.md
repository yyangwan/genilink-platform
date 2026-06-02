# GeniLink Platform 鈥?Design TODOs

## Design System
- [ ] **Create DESIGN.md** 鈥?Run `/design-consultation` to document the CSS variable system, font choices, spacing scale, component patterns, and responsive breakpoints. The codebase already has consistent patterns that should be codified before more components are added.
  - Why: Every new feature adds ad-hoc style decisions without a design system document.
  - Depends on: None. Can run anytime.

## Accessibility
- [ ] **Audit color contrast ratios** 鈥?Verify `var(--color-error)` and `var(--color-success)` against `var(--bg-primary)` meet WCAG AA (鈮?.5:1). Check ErrorState, KPIScorecard, and new diagnostic checklist components.
  - Why: Low-vision users may not see error/success messages if contrast is insufficient.
  - Depends on: CSS variable values (check current theme).

## Security (noted in eng review)
- [x] **Add workspace-scoping to project-scoped API routes** 鈥?Multiple `/api/integration/*` routes trust `projectId` without verifying workspace ownership. This is a pre-existing security gap.
  - Why: Any authenticated user could potentially access other workspaces' project data.
  - Depends on: None. Can fix independently.

## Test Infrastructure
- [ ] **Set up test infrastructure** 鈥?Zero test coverage currently. Add Vitest + Playwright + MSW.
  - Why: Manual testing only. Regressions are caught in production.
  - Depends on: None.

## 鏅哄壍 Content Studio 鈥?Frontend Gaps (2026-05-23)
- [x] **Phase 1: Enhanced 4 existing pages** (2026-05-23):
  - `/content` 鈥?鏅鸿 data bridge already functional (KPI strip, topic suggestions, cold start)
  - `/content/list` 鈥?10-status badge system, search, status/platform filters, bulk select+delete+publish, quality score coloring
  - `/content/new` 鈥?Template selector, brand voice selector, AI generation trigger on submit, advanced options (references, notes)
  - `/content/[id]/edit` 鈥?Multi-platform editor tabs, status badge, quality score display, schedule picker, publish workflow
  - Depends on: ContentOS backend running on port 4002.

- [x] **Phase 2/3: Create 6 missing pages** 鈥?Full implementations connected to API proxy:
  - `/content/calendar` 鈥?Calendar grid with month nav, event badges, status colors
  - `/content/insights` 鈥?KPI cards, status/platform breakdown bars, top performing list
  - `/content/genie` 鈥?URL source management + AI generate panel with history
  - `/content/brand-voices` 鈥?Full CRUD with tone keywords, sample content
  - `/content/templates` 鈥?Full CRUD with category filter, variable placeholders
  - `/content/settings` 鈥?Platform connection cards (6 platforms) with status/refresh
  - Done: 2026-05-23. Backend ContentOS running on port 4002.
- [x] **Priority: P0** Fix pre-existing test failure: `zhijian-client.test.ts` 鈥?'should replace :id placeholder with externalId in URL' (port mismatch after 3000鈫?001 change)
  - Why: Tests assert URLs with stale port configuration.
  - Noticed by: gstack /ship on 2026-05-20
- [x] **Priority: P0** Fix pre-existing test failure: `zhijian-client.test.ts` 鈥?'should send POST with body when provided' (port mismatch)
  - Why: Tests assert fetch calls with stale port configuration.
  - Noticed by: gstack /ship on 2026-05-20
- [x] **Priority: P0** Fix pre-existing test failure: `onboarding-api.test.ts` 鈥?'should skip workspace creation if user already has one (idempotent)' (ensureMappings error at route.ts:49)
  - Why: Onboarding route throws when mappings already exist.
  - Noticed by: gstack /ship on 2026-05-20


