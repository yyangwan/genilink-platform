@AGENTS.md

## Current Status
CEO + Eng + Design reviews CLEARED for 智創 Content Studio (2026-05-21). 27 decisions locked (D1-D20, E1-E7). Bridge-first dashboard, TipTap editor with slide-in AI panel, CRUD route group under /api/content/, withContentAuth helper, Vitest + Playwright test infra. Next: implement T3 (security fix) → T2 (streaming proxy) → T1 (CRUD routes) → T4 (tests) → T6 (dashboard) → T5 (editor) → T7 (list).

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
