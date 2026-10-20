# Independent Release Scopes

The cloud service (including its web client) and Windows device gateway are
independent deployment targets. Sharing a repository does not couple releases.

| Changed system | Source | Validation | Deployment target |
| --- | --- | --- | --- |
| Device gateway | `deploy/mobile-gateway/**` (including handlers, browser runtime and receiver) | `test-release.ps1` on Windows PowerShell 5.1 and PowerShell 7; browser Node parser tests | Windows gateway runtime only |
| Cloud service and web client | `src/**`, `prisma/**`, root packages, Docker and cloud deployment files | `npm run release:check`, authoritative CI and Docker acceptance | Cloud Docker blue/green only |
| Independent analysis backend | Separate `geo-visibility-analyze` repository | That repository's source/image checks | Its own API/worker release only |
| Mixed | More than one scope | Each affected system's checks | Separate releases and verification |

`scripts/release-scope.mjs` is the executable routing rule. Unknown paths default
to the cloud service so a new dependency cannot silently bypass its gates.
`AGENTS.md`, this runbook, `VERSION` and `CHANGELOG.md` alone deploy neither
system. Adding metadata to a gateway change does not turn it into a cloud release.
For a rename across systems, both the old and new paths count.

## CI Routing

The existing `ci.yml` always runs scope classification. On PRs it compares the
base and head commits; on main pushes it compares the previous and new commits.
Gateway-only changes run gateway tests on Windows, while cloud build, image and
deploy jobs are skipped. Server-only changes keep the original source/image/
blue-green flow and skip gateway tests. Mixed changes run both check groups;
only the cloud portion auto-deploys. Gateway publishing remains an explicit,
separate operation from the trusted local workspace to the authorized LAN host.

Do not use `[skip ci]` to publish gateways after this routing change is landed.
Do not disable the workflow, copy source to the cloud host, or restart cloud
services to publish gateway files. Changes to the routing or cloud workflow itself
are cloud release-infrastructure changes and take the full server check path.

## Gateway Release

1. Validate locally with both `powershell` and `pwsh`:
   `-NoProfile -ExecutionPolicy Bypass -File deploy/mobile-gateway/test-release.ps1`.
   Run `node --test deploy/mobile-gateway/browser-runtime/*.test.mjs` as well.
2. Push from local git, create a PR, require passing gateway checks, then merge.
3. Build a gateway archive from the exact landed full SHA using `git archive`.
   Verify its SHA-256 on transfer; never publish a dirty working-tree directory.
4. Publish only gateway runtime files on the authorized Windows host. Before
   replacing files, confirm no capture jobs are running, stop the agent and hold
   its `Global\MobileGatewayAgent` mutex as SYSTEM. Keep Appium running.
5. Back up existing files and record newly introduced files. Validate all copied
   hashes against the archive. On copy failure restore old files and remove only
   the exact files newly introduced by this attempt, then restart the agent.
6. Preserve `config/gateway-agent.json`, tokens, device order and receiver
   allowlist, browser profile/login, results and existing backups. Do not rerun
   `install-gateway-agent.ps1` as an update command: it rewrites private config.
   Dependency or receiver APK changes require their own explicit install step;
   copying scripts does not install browser packages or device APKs.
7. Record the full SHA, file hashes and backup path in the gateway release
   receipt. Verify one running agent, fresh server heartbeat, configured device
   count, ADB/Appium and browser readiness. These checks do not require a cloud
   restart or a new audit. Real capture tests are separate from release health.

For gateway rollback, stop the idle agent under the same mutex, restore the
recorded backup files, remove only files recorded as introduced by that release,
restart and verify heartbeat. Never restore private configuration or browser
profiles from a generic source archive.

## Cloud Release

Follow `deploy/CONTAINER_DEPLOYMENT.md`. Keep immutable SHA images, runner-to-host
image transfer, inactive-slot health validation, Nginx switching and retained
rollback containers unchanged. Never deploy gateway files as a side effect.

Release reports should identify each deployed system and its exact SHA. Say
explicitly when the other system was not deployed. Do not expand a scoped user
request to unrelated pending PRs or historical fixes.
