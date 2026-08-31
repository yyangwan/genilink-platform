<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Workflow

- Develop and test changes locally in this workspace first.
- Push source changes to git from local only.
- Treat the production host as pull-only: update it by pulling from git, not by editing code directly on the server.
- If a production-only fix is ever unavoidable, mirror it back into this repo immediately so local and production stay aligned.

## Token-efficient release execution

For a routine user request such as “提交部署” or “提交并上线”, use the compact release path:

- Do not start review subagents or broad review skills unless the user asks for them or the change touches authentication, billing, database migrations, deployment infrastructure, or another high-risk boundary.
- Run the mandatory local source gates exactly once per unchanged source tree with `npm run release:check`. The command keeps successful logs quiet and expands only the failed gate.
- Reuse a successful gate result while only release metadata changes (`VERSION`, package version, or `CHANGELOG.md`); do not rerun the full suite for metadata-only edits.
- Create one pull request, let GitHub Actions perform the authoritative clean full pass, and inspect detailed CI logs only when a job fails.
- After merge, watch the single `main` workflow through deployment. Avoid repeated status polling and intermediate narration when state has not changed.
- Perform production verification once after the workflow completes, report only the commit SHA, workflow result, active slot, health result, resource status, and rollback readiness.
- Keep user updates to meaningful transitions: local gates complete, PR/CI running, and deployment verified.
