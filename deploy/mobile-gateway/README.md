# Mobile Device Gateway

Windows gateway host:

- Hostname: `CHAO`
- LAN address: `192.168.0.101`
- Android SDK: `C:\Program Files\Android`
- Appium runtime: `C:\ProgramData\MobileGateway\appium-runtime`
- Appium endpoint: `http://127.0.0.1:4723`
- Health status: `C:\ProgramData\MobileGateway\status.json`

## Scheduled Tasks

- `MobileGateway-Appium`: starts Appium as `SYSTEM` at boot.
- `MobileGateway-Health`: checks ADB, Appium, attached devices, disk space,
  and uptime every minute.
- `MobileGateway-Agent`: opens an outbound HTTPS connection to the visibility
  service, reports health, and claims leased tasks.

Appium deliberately listens on loopback only. Cloud workers should reach the
gateway through an authenticated outbound agent or an SSH tunnel rather than
exposing port 4723 to the LAN or internet.

Install the outbound agent after provisioning its server-side token:

```powershell
.\install-gateway-agent.ps1 `
  -BaseUrl "https://genilink.cn/visibility" `
  -GatewayId "CHAO" `
  -Token "<provisioned-token>"
```

The token is stored in `config\gateway-agent.json`. The installer replaces its
ACL so only `SYSTEM` and local administrators can read it.

The agent uses the installed Node.js runtime for outbound HTTPS. Requests and
responses cross the PowerShell/Node boundary through explicit UTF-8 files,
not process standard streams. This avoids both a known TLS interoperability
problem and Windows PowerShell 5.1 console-code-page corruption for Chinese
prompts and answers.

Qwen audit prompts use a separate `browser.prompt` queue and a dedicated
headless Edge profile under `C:\ProgramData\MobileGateway\browser-runtime`.
The installer pins `playwright-core` and installs it with `npm ci` on the
gateway. Edge must be installed on that machine; the worker never uses an
Android device. Browser capacity is one task, independent of the configured
Android pool. The Web profile is persistent but runs as the scheduled task's
`SYSTEM` account, so any required Qwen login must be established in that
profile before production use. A login challenge or changed Web UI causes a
task failure rather than a fabricated source list.

Set `deviceSerials` in `config\gateway-agent.json` to the authorized devices
that may run capture tasks. The agent maintains a bounded worker pool, assigns
one task to each idle online device, and skips devices that are offline or
already busy. A task with an explicit `payload.device_serial` keeps that
assignment. `maxConcurrentTasks` optionally limits concurrency below the
number of configured devices; zero or omission uses the configured device
count. Restart `MobileGateway-Agent` after changing either value.

Each active device receives stable UiAutomator2 `systemPort` and MJPEG ports
derived from its position in `deviceSerials`. Keep that list order stable
during active work. Gateway heartbeats expose per-device `busy` and `taskId`
state without changing the audit result contract.

## Platform Handlers

The gateway currently supports:

- `doubao` + `app`: starts an isolated Doubao conversation, submits
  `payload.prompt`, waits for the completed response, expands every cited
  reference, and collects each source title and real URL through Doubao's
  Copy Link action. It also stores a screenshot and final Appium page source
  under `C:\ProgramData\MobileGateway\results`.
- `deepseek` + `app`: collects every search-result record and resolves the
  exact destination URL through Android's outbound browser intent.
- `yuanbao` + `app`: collects every source name and title from the reference
  panel, opens each source, uses the detail page's Copy Link action, and reads
  the exact source URL from the Android clipboard. URLs printed in the answer
  are retained separately in `answer_urls`.
- `qwen` or `qianwen` + `app`: collects every source name, title, and exposed
  domain. Its generated URL is explicitly labeled `site_root`, not an exact
  article path.
- `qwen` + `web`: opens a fresh Web conversation in Edge, sends the prompt,
  expands `查看全部`, and returns exact article URLs from the displayed search
  reference cards. These are search references, not necessarily inline-cited
  references in the answer. The audit adapter routes Qwen to this handler;
  the legacy app handler remains installed but is not selected by that adapter.
- `kimi` + `app`: scrolls through lazy-loaded answer segments, opens the
  searched-web-pages panel, catalogs every paged result card, and extracts each
  exact original URL through the in-app article share sheet.

Task results include `reference_count`, `source_count`, `answer_urls`, and a
`sources` array. Every expected reference keeps its list index. A source that
cannot be opened or copied is returned with `status: failed` and an
`error_message` rather than being silently omitted. Source records use
`url_resolution` to distinguish `exact`, `site_root`, and `unavailable`
destinations.

Before reporting completion, the agent independently checks that an answer
exists and at least 90% of the reported references have collected HTTP(S)
URLs. Zero-reference results are treated as unverified, not automatically
complete. An unverified result gets one fresh capture on the same device if
the task is less than 10 minutes old. The retry writes to a separate evidence
directory; the agent reports whichever attempt has more valid sources, using
completeness as the tie-breaker. When the retry fails or time budget is gone,
the first result is preserved. Verification outcomes are logged in
`logs\gateway-agent.log`; they do not change the audit result schema. This
check is a per-result target, not a measured 90% production success rate.

### Citation share fallback (device-pool opt-in)

`share-receiver/` contains a minimal Android `ACTION_SEND` receiver. It has no
network permission. Its capture is armed with a one-time nonce through an
ADB-shell-only broadcast, and read once through an ADB-shell-only content
provider. A share arriving without an active request is discarded. The gateway
rejects expired, unrelated, ambiguous, or non-HTTP(S) payloads. Clipboard copy
remains the preferred path; the receiver is attempted only after copy fails.

Build locally with `share-receiver/build.ps1 -JavaHome <JDK-or-JRE-11+>` and a
signing keystore stored outside the repository. Run `test-share-receiver.ps1`
and `test-capture-verifier.ps1` before installation. Install the same signed
`.build/citation-receiver.apk` on every intended pool device; verify its
package with `adb -s <serial> shell pm path com.genilink.citationreceiver`.
Pass the exact device serials in `-ShareReceiverDeviceSerials <serials>` to
`install-gateway-agent.ps1`. Every listed serial must also be in
`-DeviceSerials`; an empty list disables the fallback. The old singular
`-ShareReceiverDeviceSerial` parameter remains supported for installation.
The agent checks the package on the assigned device before each fallback, so
an uninstalled or unavailable receiver cannot be selected. The copy-link path
remains primary; share is attempted only after it fails. This is a targeted
recovery path, not a guaranteed citation-completeness rate: PDF pages,
missing share actions, and ambiguous Kimi sources remain known gaps. Remove
the allowlist (and restart the agent) or uninstall the APK to restore the
original capture path.

Kimi citations are inventoried from the final answer's inline clickable cards,
not the `搜索网页` candidate list. Multiple card occurrences are retained even
when they share a canonical article URL. Qwen site roots do not count as exact
article URLs. The verifier counts only `exact` URLs toward completeness; an
unresolved source remains a failed record. Per-source retries occur in the
same answer before the existing whole-task retry.

Doubao counts multiple visible search-reference cards and does not collapse
items merely because their displayed ordinal repeats. It walks the opened
reference list to a stable end before finalizing the expected count. A card
outside the accessible viewport can still escape this local inventory; treat
the trial coverage rate, not the per-result threshold alone, as the release
criterion.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
.\test-capture-verifier.ps1` locally before installing agent changes.

App handlers accept these optional payload values:

- `timeout_seconds`: response timeout up to 600 seconds.
- `new_conversation`: starts an isolated conversation by default.
- `device_serial`: targets a specific authorized ADB device.

Handlers use a mutex scoped to the selected device. Separate devices may run
capture tasks concurrently, while duplicate work on the same phone is rejected.

Huawei devices intercept normal ADB APK installation. UiAutomator2's test APK
must be pushed to the device and installed with `pm install -r -t -g`. Once the
Appium helper packages are installed, handlers use `skipDeviceInitialization`
and `skipServerInstallation` to avoid repeated installation prompts.

`genilink.cn` currently has no public A record. Until DNS is corrected, the
gateway hosts file maps it to `8.147.56.119`; the original hosts file is backed
up at `C:\ProgramData\MobileGateway\backups\hosts.pre-genilink-dns`. Remove the
manual mapping after public DNS resolves the domain to the production server.

## Verification

### Capture Recovery

- Qwen uses the persistent Chrome profile under `browser-runtime/profile`.
  A visible login or verification dialog fails fast with `QWEN_LOGIN_REQUIRED`
  or `QWEN_CHALLENGE_REQUIRED`; the task is not automatically replayed.
  Restore login interactively in that same profile. Never replace it with an
  unrelated default Chrome profile or export cookies into logs.
- Browser failures retain a diagnostic JSON (stage, URL and response state)
  beside the temporary result path. Non-login failures also retain a screenshot.
  The task error points to the diagnostic, rather than a Node stack header.
- App collectors retry citation retrieval on the same answer, reuse verified
  index/title matches, and preserve the largest observed reference count.
  The verifier never submits the prompt a second time. The source retry window
  starts at source collection, not task creation.
- `device-failures.json` persists device cooldowns: hierarchy/offline/lock
  failures exclude the device across apps for 20 minutes; other capture failures
  exclude it for the same platform for 10 minutes. The same task avoids its
  failed devices for one hour. Cooldowns expire automatically and must not be
  confused with permanent removal from the configured pool.
- A partial citation result remains partial in its existing source status and
  completeness fields; source indices or counts are never reduced to hide gaps.

Run the local recovery tests before deployment:

```powershell
.\test-source-only-retry.ps1
.\test-device-selector.ps1
.\test-device-unlock.ps1
.\test-gateway-failure-policy.ps1
.\test-capture-verifier.ps1
node --test browser-runtime/qwen-state.test.mjs browser-runtime/qwen-extract.test.mjs
```

Run these commands on the gateway:

```powershell
Get-Service sshd
Get-ScheduledTask -TaskName "MobileGateway-Appium", "MobileGateway-Health"
Invoke-RestMethod "http://127.0.0.1:4723/status"
& "C:\Program Files\Android\platform-tools\adb.exe" devices -l
Get-Content "C:\ProgramData\MobileGateway\status.json"
```

## Device Enrollment

### Qwen Browser Identity

For Windows gateways, set `browserInteractiveUser` to the Windows account used
for Qwen QR login (installer parameter `-BrowserInteractiveUser`). Browser tasks
then run visible Chrome as short-lived, non-elevated interactive scheduled tasks for that
account, while the gateway agent and Android workers remain under SYSTEM.
Keep this user signed into Windows; a locked desktop is acceptable, a signed-out
user is not. A missing interactive session fails explicitly instead of waiting
for a model answer. No Windows password or exported browser cookies are stored.
Each worker has a bounded deadline and removes only its own scheduled task.

The installer grants that user Modify access only to `browser-runtime/profile`
and `browser-runtime/work`, including existing SYSTEM-owned Chrome files.
Gateway configuration and script permissions are not broadened.
Qwen sources are collected from the current answer's full source panel, including
card metadata URLs. The panel's source count, not the analysis tool's aggregate
search-material count, is the expected reference count. Missing rows or URLs fail
collection rather than silently returning a complete result.

Run `pwsh -NoProfile -File .\test-browser-task.ps1` before gateway deployment.

1. Enable Android developer options and USB debugging.
2. Connect the phone by USB and keep it unlocked.
3. Accept the RSA authorization prompt generated by the gateway's `SYSTEM`
   account.
4. Confirm that `adb devices -l` reports the device as `device`, not
   `unauthorized`.

Reserve `192.168.0.101` in the router for MAC address
`D8:5E:D3:95:A4:87`. Do not configure a host-side static address without
also excluding that address from the DHCP pool.
