@AGENTS.md

## Current Status
All reviews passed (CEO + ENG + DESIGN) on 2026-05-20. CEO plan for UX context overhaul approved with 9 design decisions resolved (score 5→9/10). Next: implement ContextBar, ProjectSelector, ProjectWizard, DiagnosticChecklist, Toast components.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 4002, not running yet
- SERVICE_TOKEN: stored in .env.local, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
