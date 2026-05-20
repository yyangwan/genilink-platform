@AGENTS.md

## Current Status
Shipped v0.1.0.1 (PR #2) on 2026-05-20 — design review fixes + security fix + 18 tests. Next: merge PR, then implement UX context overhaul (ContextBar, ProjectSelector, ProjectWizard, DiagnosticChecklist, Toast).

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 4002, not running yet
- SERVICE_TOKEN: stored in .env.local, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
