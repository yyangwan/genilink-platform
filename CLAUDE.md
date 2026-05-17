@AGENTS.md

## Current Status
智見 full feature parity implemented (2026-05-17): 8 pages (audits, report, brands, prompts, suggestions, trends, compare, schedules), 18 proxy routes, 8 shared components, restructured sidebar with accordion. Build passes. Next: browser testing, recharts integration, backend testing.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
