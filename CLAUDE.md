@AGENTS.md

## Current Status

内容工作流 v1 评审整改完成（branch codex/content-workflow-v1，报告 docs/content-workflow-v1-implementation-review.md，R1–R14 全修 + §8.3/§8.6/§16.2 覆盖缺口补齐）。两仓门禁全绿（Portal 529/529、ContentOS 530/530、tsc/lint 0 错误），改动未提交。待办: 两仓提交 → PR CI → ContentOS 先 Portal 后发布 → 上线核实 cron/回调密钥/停用开关演练。Billing 整改已提交 (7a8b5c7)，待二次审查与生产演练。进度: `~/.gstack/projects/genilink-platform/progress.md`

## ContentOS JWT Integration (done)

智见统一签发 RS256 JWT 给 ContentOS (port 4002), ContentOS 中间件验证 JWT, 注入 `x-genilink-*` headers.

- Algorithm: RS256
- Issuer: `https://app.genilink.cn`
- Audience: `content.genilink.cn`
- kid: `genilink-v1`
- JWKS: `/.well-known/jwks.json` (由 `.keys/public.pem` 导出)
- Proxy header: `X-Genilink-Project-Id`
- ContentOS 认证: `getServiceSession()` 读取 JWT headers, `getServiceWorkspace()` 从项目 ID 推导 workspace
- 架构方向: 智见统一管理用户 / 工作空间 / 项目，ContentOS 只提供业务功能
- ContentOS 启动: 需要 `NO_PROXY=localhost,127.0.0.1`，否则 JWKS fetch 会被代理拦截

## Dev Notes

- Dev server stability: `next build && next start` preferred over `next dev` for routes proxying to external services
- Build segfaults on Windows: retry with `NODE_OPTIONS="--max-old-space-size=4096"`
- On this Windows machine, `node:child_process.spawn()` with `stdio: 'pipe'` can fail with `EPERM`; `stdio: 'inherit'` and `stdio: 'ignore'` still work. If `next dev` hits this, prefer `next build && next start`.
- `start-all.sh` uses PowerShell wrappers for the two Next apps on Windows and writes the frontend build to `/.next-runtime/`; treat that directory as disposable build output, not source.
- 智见服务通过 `https://genilink.cn/visibility` 暴露；`start-all.sh` 通过 SSH + `docker compose` 管理远端智见，并默认设置 `VISIBILITY_SERVICE_URL=https://genilink.cn/visibility`
- Higress 运行在同一台服务器上，独立在 `E:\workspace\higress` 工作空间维护，不纳入 `start-all.sh`
- `start-all.sh` 支持 `up | stop | restart | status` 以及 `stop-visibility | restart-visibility | status-visibility`，本机负责 ContentOS + Frontend，远端资源通过 `VISIBILITY_REMOTE_SSH_TARGET` / `VISIBILITY_REMOTE_ROOT` 配置
- 默认远端目录是 `VISIBILITY_REMOTE_ROOT=/root/geo-visibility-analyze`
- 常用命令:
  - `./start-all.sh`
  - `./start-all.sh status`
  - `./start-all.sh restart-visibility`
  - `./start-all.sh stop`
  - 覆盖远端位置: `VISIBILITY_REMOTE_SSH_TARGET=root@8.147.56.119 VISIBILITY_REMOTE_ROOT=/root/geo-visibility-analyze ./start-all.sh status`
- ContentOS backend: port 4002, JWT Bearer auth working, proxied via `/api/content/*` routes
- SERVICE_TOKEN: stored in `.env.local`, obtained from visibility backend `/api/auth/login`
- External mappings: workspace projects mapped to visibility project ID 9 via ExternalResourceMapping table
- Project selection: ProjectContext in dashboard layout, cookie `genilink-project`, API `/api/projects/select`
- All 10 dashboard pages use `useProject()` - no more `useSearchParams().get("project")` + manual fetch
- `use-project-id.ts` provides backward compat: URL `?project=` param still works (one-way sync to cookie)

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
