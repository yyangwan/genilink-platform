@AGENTS.md

## Current Status
Auth + project CRUD verified, billing bypass enabled (2026-05-18). Dashboard APIs return correct empty states. Integration APIs (brands/prompts/schedules/audits/trends) need backend at port 8000. Next: backend data testing, mobile responsive, frontend error handling.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 3001, placeholder until service is ready
