# GeniLink Platform — Design TODOs

## Design System
- [ ] **Create DESIGN.md** — Run `/design-consultation` to document the CSS variable system, font choices, spacing scale, component patterns, and responsive breakpoints. The codebase already has consistent patterns that should be codified before more components are added.
  - Why: Every new feature adds ad-hoc style decisions without a design system document.
  - Depends on: None. Can run anytime.

## Accessibility
- [ ] **Audit color contrast ratios** — Verify `var(--color-error)` and `var(--color-success)` against `var(--bg-primary)` meet WCAG AA (≥4.5:1). Check ErrorState, KPIScorecard, and new diagnostic checklist components.
  - Why: Low-vision users may not see error/success messages if contrast is insufficient.
  - Depends on: CSS variable values (check current theme).

## Security (noted in eng review)
- [ ] **Add workspace-scoping to project-scoped API routes** — Multiple `/api/integration/*` routes trust `projectId` without verifying workspace ownership. This is a pre-existing security gap.
  - Why: Any authenticated user could potentially access other workspaces' project data.
  - Depends on: None. Can fix independently.

## Test Infrastructure
- [ ] **Set up test infrastructure** — Zero test coverage currently. Add Vitest + Playwright + MSW.
  - Why: Manual testing only. Regressions are caught in production.
  - Depends on: None.
- [ ] **Priority: P0** Fix pre-existing test failure: `zhijian-client.test.ts` — 'should replace :id placeholder with externalId in URL' (port mismatch after 3000→3001 change)
  - Why: Tests assert URLs with stale port configuration.
  - Noticed by: gstack /ship on 2026-05-20
- [ ] **Priority: P0** Fix pre-existing test failure: `zhijian-client.test.ts` — 'should send POST with body when provided' (port mismatch)
  - Why: Tests assert fetch calls with stale port configuration.
  - Noticed by: gstack /ship on 2026-05-20
- [ ] **Priority: P0** Fix pre-existing test failure: `onboarding-api.test.ts` — 'should skip workspace creation if user already has one (idempotent)' (ensureMappings error at route.ts:49)
  - Why: Onboarding route throws when mappings already exist.
  - Noticed by: gstack /ship on 2026-05-20
