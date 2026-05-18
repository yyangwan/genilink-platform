@AGENTS.md

## Current Status
Error handling + mobile responsive fixes committed (2026-05-18). ErrorState component added to 6 pages, API failures show friendly error with retry. Compare page grids made responsive. Next: recharts code splitting, backend data testing (needs port 8000), notification SSE.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
