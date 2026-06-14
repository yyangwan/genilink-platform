@AGENTS.md

## Current Status
全平台 QA 通过 (29/29 OK + 1 SKIP). Phase 6 (ContentOS projectId header) 已确认完成. 下一步是 Phase 7 E2E 验证（启动三服务）. 进度: ~/.gstack/projects/genilink-platform/progress.md

## ContentOS JWT Integration (done)
智见统一签发 RS256 JWT 给 ContentOS (port 4002), ContentOS 中间件验证 JWT, 注入 x-genilink-* headers.
- **Algorithm**: RS256, **Issuer**: `https://app.genilink.cn`, **Audience**: `content.genilink.cn`, **kid**: `genilink-v1`
- **JWKS**: `/.well-known/jwks.json` (由 `.keys/public.pem` 导出)
- **Proxy header**: `X-Genilink-Project-Id` 携带 Genilink 项目 ID
- **ContentOS 认证**: `getServiceSession()` 读取 JWT headers, `getServiceWorkspace()` 从项目 ID 推导 workspace
- **架构方向**: 智见统一管理用户/工作空间/项目，ContentOS 只提供业务功能
- **ContentOS 启动**: 需要 `NO_PROXY=localhost,127.0.0.1` (否则 JWKS fetch 会被代理拦截)

## Dev Notes
- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- Build segfaults on Windows: retry with `NODE_OPTIONS="--max-old-space-size=4096"`
- On this Windows machine, `node:child_process.spawn()` with `stdio: 'pipe'` can fail with `EPERM`; `stdio: 'inherit'` and `stdio: 'ignore'` still work. If `next dev` hits this, prefer `next build && next start`.
- `start-all.sh` uses PowerShell wrappers for the two Next apps on Windows and writes the frontend build to `/.next-runtime/`; treat that directory as disposable build output, not source.
- 智见服务已远端部署到 `https://genilink.cn/marketing`，由 `8.147.56.119` 提供；`start-all.sh` 通过 SSH + `docker compose` 统一管理远端智见，并设置 `VISIBILITY_SERVICE_URL=https://genilink.cn/marketing`
- `start-all.sh` 支持 `up | stop | restart | status` 以及 `stop-visibility | restart-visibility | status-visibility`，本机只负责 ContentOS + Frontend，远端智见通过 `VISIBILITY_REMOTE_SSH_TARGET` / `VISIBILITY_REMOTE_ROOT` 配置
- 默认远端目录是 `/root/geo-visibility-analyze`
- 常用命令：
  - `./start-all.sh`
  - `./start-all.sh status`
  - `./start-all.sh restart-visibility`
  - `./start-all.sh stop`
  - 覆盖远端位置：`VISIBILITY_REMOTE_SSH_TARGET=root@8.147.56.119 VISIBILITY_REMOTE_ROOT=/root/geo-visibility-analyze ./start-all.sh status`
- ContentOS backend: port 4002, JWT Bearer auth working, proxied via `/api/content/*` routes
- SERVICE_TOKEN: stored in `.env.local`, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
- Project selection: ProjectContext in dashboard layout, cookie `genilink-project`, API `/api/projects/select`
- All 10 dashboard pages use `useProject()` - no more `useSearchParams().get("project")` + manual fetch
- `use-project-id.ts` provides backward compat: URL `?project=` param still works (one-way sync to cookie)
