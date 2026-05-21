@AGENTS.md

## Current Status
Eng review vs ContentOS architecture docs completed (2026-05-21). 3 P0 hard blockers found (Codex outside voice): T0a req.json() double-read bug, T0b edit page never loads content, T0c AI insert broken with TipTap. 9 P1-P3 tasks queued. All previous tasks (T1-T7) shipped. Next: fix T0a/T0b/T0c → full proxy (22 modules) → tests.

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
