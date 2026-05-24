@AGENTS.md

## Current Status
Phase 1 实施中 (2026-05-24). T1-T5,T4 done, build passes. Brand model + CRUD API + sync + page + sidebar committed (3c1ea37). Next: T9 tests, T7 integration proxy, T10/T11 cleanup.

## ContentOS JWT Integration (done)
智链发送 RS256 JWT 到 ContentOS (port 4002)。ContentOS 中间件验证 JWT，注入 x-genilink-* headers。
- **Algorithm**: RS256, **Issuer**: `https://app.genilink.cn`, **Audience**: `content.genilink.cn`, **kid**: `genilink-v1`
- **JWKS**: `/.well-known/jwks.json` (从 `.keys/public.pem` 导出)
- **Proxy header**: `X-ContentOS-Project-Id` 携带 ContentOS 项目 ID
- **ContentOS 认证**: `getServiceSession()` 读取 JWT headers, `getServiceWorkspace()` 从项目 ID 推导 workspace
- **架构方向**: 智链统一管理用户/工作空间/项目，智创只提供业务功能
- **ContentOS 启动**: 需要 `NO_PROXY=localhost,127.0.0.1` (否则 JWKS fetch 被代理拦截)

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- Build segfaults on Windows — retry with `NODE_OPTIONS="--max-old-space-size=4096"`
- 智見 backend: port 8000, proxied via `/api/integration/*` routes with billing guard
- 智創 backend: port 4002, JWT Bearer auth working, proxied via `/api/content/*` routes
- SERVICE_TOKEN: stored in .env.local, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
- Project selection: ProjectContext in dashboard layout, cookie `genilink-project`, API `/api/projects/select`
- All 10 dashboard pages use `useProject()` — no more `useSearchParams().get("project")` + manual fetch
- `use-project-id.ts` provides backward compat: URL `?project=` param still works (one-way sync to cookie)
