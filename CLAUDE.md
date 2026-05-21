@AGENTS.md

## Current Status
P0 bugs fixed (T0a/T0b/T0c) — double-read, edit page load, TipTap AI insert (2026-05-22). Backend blocker E9 (ContentOS API key auth) still pending. 3 parallel lanes: Lane A done, Lane B blocked by E9, Lane C (UI with MSW mocks) ready to start. Next: start Lane C UI work or wait for backend.

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
