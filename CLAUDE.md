@AGENTS.md

## Current Status
Design review #2 + Eng review #5 completed (2026-05-21). Plan realigned to ContentOS API (22 modules, 47 endpoints). 10 new design decisions (D21-D30), 6 eng decisions (E8-E13). 3 P0 code bugs + 1 backend blocker (E9: ContentOS must add API key auth). Test coverage 5% (38 gaps). Next: fix P0s → wait for backend API key → build proxy routes (Lane B) + UI components with MSW mocks (Lane C) in parallel.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- Build segfaults on Windows — retry with `NODE_OPTIONS="--max-old-space-size=4096"`
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 4002, not running yet
- SERVICE_TOKEN: stored in .env.local, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
- Project selection: ProjectContext in dashboard layout, cookie `genilink-project`, API `/api/projects/select`
- All 10 dashboard pages use `useProject()` — no more `useSearchParams().get("project")` + manual fetch
- `use-project-id.ts` provides backward compat: URL `?project=` param still works (one-way sync to cookie)
