@AGENTS.md

## Current Status
Recharts code splitting done, performance audit passed (2026-05-18). Client JS 2.0 MB total, recharts code-split correctly (~945 KB lazy), lucide tree-shaken (22 KB), next-auth 10 KB. Next: backend data testing (needs port 8000), notification SSE.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
