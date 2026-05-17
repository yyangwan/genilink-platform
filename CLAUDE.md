@AGENTS.md

## Current Status
CEO audit round 2 (2026-05-17): all 15 issues addressed. ConfirmDialog, logout confirmation, workspace selector, dashboard real data proxy, visibility analysis trigger (create audit → analyze → poll), project detail page, billing settings tab. Dev server: use `next build && next start` for stability (dev mode may hang on proxy routes).

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
