@AGENTS.md

## Current Status
智創 frontend complete (2026-05-23). All 10 pages implemented + enhanced. Proxy (middleware) added for auth + module access control. 77/77 tests passing. ContentOS backend (port 4002) JWT auth needs config — proxy returns 502 "Service auth expired".

## ContentOS JWT Integration (backend config needed)
Our platform sends RS256 JWT to ContentOS (port 4002). Backend must accept:
- **Algorithm**: RS256
- **Issuer**: `https://app.genilink.cn`
- **Audience**: `content.genilink.cn`
- **Key ID**: `genilink-v1`
- **Public key**: `.keys/public.pem` (corresponding to `.keys/private.pem` used for signing)
- **TTL**: 5 minutes
- Sent as `Authorization: Bearer <token>` header
- Config: `src/lib/auth/service-jwt.ts`

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
