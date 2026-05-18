@AGENTS.md

## Current Status
Integration data testing complete (2026-05-18). 12/13 integration routes verified against live visibility backend (port 8000). Visibility aggregation rewrites, URL path fixes for suggestions/schedules/audits/audit-status. Next: content service (port 4002), UI dogfooding.

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 4002, not running yet
- SERVICE_TOKEN: stored in .env.local, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
