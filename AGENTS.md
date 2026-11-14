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

### Independent deployment scopes

- Treat the device gateway and cloud service (including the web client) as independent systems. See `deploy/RELEASE_SCOPES.md`.
- Changes under `deploy/mobile-gateway/**` deploy ONLY to the gateway. Run `powershell -File deploy/mobile-gateway/test-release.ps1`, the same command with `pwsh`, and the browser parser Node tests. Do not run server release gates or deploy/restart cloud services for gateway-only changes.
- Cloud service/client changes use targeted local validation, PR/CI, an immutable Docker image and blue/green server deployment. Do not copy gateway files or restart gateway tasks for server-only changes.
- For mixed changes, validate and deploy each changed system separately; report each system's revision and verification independently. A pending change in another system is not authorization to deploy it.
- A generic request to submit/deploy covers the systems changed by the current task, not unrelated pending changes. An explicitly named system limits deployment to that system.
- Gateway releases must come from a landed commit with passing gateway checks, use exact git archives, back up and hash-check runtime files, preserve private configuration/device pool/browser login, update only while idle under the SYSTEM agent mutex, and verify the fresh heartbeat. Do not rerun the provisioning installer over an existing gateway config.
- CI classifies changes before server jobs. Gateway-only changes must not build/publish a server image or deploy the server. Do not use `[skip ci]` as the normal gateway release mechanism.

For a routine user request such as “提交部署” or “提交并上线”, use the compact release path:

- Do not start review subagents or broad review skills unless the user asks for them or the change touches authentication, billing, database migrations, deployment infrastructure, or another high-risk boundary.
- Run local checks that cover the changes. Use `npm run release:check` for a full local diagnosis when needed.
- Create one pull request and require passing GitHub Actions checks, including the full cloud test suite and Docker build. CI may reuse the PR's source checks on `main` when the verified Git tree matches exactly. Otherwise `main` runs the full source checks before publishing.
- After merge, watch the single `main` workflow through deployment. Avoid repeated status polling and intermediate narration when state has not changed.
- Perform production verification once after the workflow completes, report only the commit SHA, workflow result, active slot, health result, resource status, and rollback readiness.
- Keep user updates to meaningful transitions: local gates complete, PR/CI running, and deployment verified.
- For coordinated frontend and ContentOS changes, apply each repository's release checks, create one PR per repository, deploy ContentOS first, deploy the frontend second, then perform one combined production verification.
