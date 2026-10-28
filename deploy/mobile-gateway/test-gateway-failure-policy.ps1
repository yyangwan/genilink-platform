$ErrorActionPreference='Stop'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'gateway-agent.ps1'),[ref]$null,[ref]$null)
$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Send-TaskFailure'},$true)
. ([scriptblock]::Create($function.Extent.Text))
function Invoke-GatewayApi {param($Method,$Path,$Body) $script:body=$Body}
function Write-AgentLog {param($Message)}
$task=[pscustomobject]@{id='test'}
Send-TaskFailure $task 'token' 'QWEN_LOGIN_REQUIRED: login expired'
if($script:body.retryable -or $script:body.error_code -ne 'gateway_auth_required'){throw 'Login cannot be retried automatically'}
Send-TaskFailure $task 'token' 'QWEN_CHALLENGE_REQUIRED: human verification'
if($script:body.retryable){throw 'Challenge cannot be retried automatically'}
Send-TaskFailure $task 'token' 'QWEN_INTERACTIVE_SESSION_REQUIRED: user signed out'
if($script:body.retryable -or $script:body.error_code -ne 'gateway_auth_required'){throw 'Missing browser login session cannot be retried automatically'}
Send-TaskFailure $task 'token' 'temporary network error'
if(-not $script:body.retryable){throw 'Transient errors should remain retryable'}
Send-TaskFailure $task 'token' 'missing handler' 'handler_not_installed'
if($script:body.retryable){throw 'Missing handler cannot be retried'}
Write-Output 'Gateway failure policy tests passed'
Send-TaskFailure $task 'token' 'No capture-ready Android device is currently available'
if (-not $script:body.retryable -or $script:body.error_code -ne 'gateway_device_unavailable' -or $script:body.retry_after_seconds -lt 30) { throw 'Device wait must retain retry backoff' }
foreach ($code in @('CAPTURE_POPUP_MANUAL_REQUIRED','CAPTURE_POPUP_RETRY_EXHAUSTED','CAPTURE_POPUP_RESUME_MISMATCH')) {
    Send-TaskFailure $task 'token' $code
    if ($script:body.retryable -or $script:body.error_code -ne 'gateway_intervention_required') { throw 'Popup intervention must stop automatic task replay' }
}

Send-TaskFailure $task 'token' 'Android device test-device is locked; configure it for unattended swipe-to-unlock access'
if($script:body.retryable -or $script:body.error_code -ne 'gateway_intervention_required') { throw 'A locked phone requires human intervention without automatic replay' }
Send-TaskFailure $task 'token' 'CAPTURE_NATIVE_TIMEOUT: start app exceeded 30 seconds'
if($script:body.retryable -or $script:body.error_code -ne 'gateway_capture_timeout') { throw 'A native process timeout must terminate explicitly without automatic prompt replay' }

. (Join-Path $PSScriptRoot 'gateway-capture-verifier.ps1')
if(-not (Get-Command Invoke-CaptureNativeCommand -ErrorAction SilentlyContinue)) { throw 'Native command deadline protection is missing' }
$engine=(Get-Process -Id $PID).Path
function Invoke-FixtureProcess {
    param([string]$Source,[int]$TimeoutSeconds=10)
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Source))
    Invoke-CaptureNativeCommand -FilePath $engine -Arguments ('-NoProfile -NonInteractive -EncodedCommand '+$encoded) -TimeoutSeconds $TimeoutSeconds -Operation 'fixture'
}
$success=Invoke-FixtureProcess -Source '[Console]::Out.Write("fixture-ok")'
if($success -ne 'fixture-ok') { throw 'Successful native output was corrupted' }
$volume=Invoke-FixtureProcess -Source '[Console]::Out.Write(("o" * 131072));[Console]::Error.Write(("e" * 131072))'
if($volume.Length -ne 131072) { throw 'Large stdout/stderr streams must drain without deadlock' }
$failure=$null
try { Invoke-FixtureProcess -Source '[Console]::Error.Write("private-diagnostic-sentinel");exit 29' | Out-Null } catch { $failure=$_.Exception.Message }
if($failure -notmatch '^CAPTURE_NATIVE_FAILED:' -or $failure -notmatch '29' -or $failure -match 'private-diagnostic-sentinel') { throw 'Native failure must preserve exit status without exposing process stderr' }
$watch=[Diagnostics.Stopwatch]::StartNew();$timeout=$null
try { Invoke-FixtureProcess -Source 'Start-Sleep -Seconds 30' -TimeoutSeconds 1 | Out-Null } catch { $timeout=$_.Exception.Message }
$watch.Stop()
if($timeout -notmatch '^CAPTURE_NATIVE_TIMEOUT:' -or $watch.Elapsed.TotalSeconds -gt 10) { throw 'A stuck native process must stop within its deadline' }
if((Invoke-FixtureProcess -Source '[Console]::Out.Write("after-timeout")') -ne 'after-timeout') { throw 'A timeout must not stop unrelated process execution' }
Write-Output 'Native launch deadline and intervention policy tests passed'

$common=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'handlers\research-app-common.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Start-DeepSeekApp','Resume-DeepSeekApp')) {
    $definition=$common.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$script:launchCalls=@()
function Invoke-CaptureNativeCommand { param($FilePath,$Arguments,$Operation,$TimeoutSeconds) $script:launchCalls+=@{arguments=$Arguments;timeout=$TimeoutSeconds} }
function adb { 'mResumedActivity: ActivityRecord{test com.deepseek.chat/.MainActivity}' }
$savedExitCode=$global:LASTEXITCODE
try {
    $global:LASTEXITCODE=37
    Start-DeepSeekApp -Serial 'test-device'
    Resume-DeepSeekApp -Serial 'test-device'
    if($script:launchCalls.Count -ne 2 -or $script:launchCalls[0].timeout -ne 30 -or $script:launchCalls[1].timeout -ne 30) { throw 'Both DeepSeek launch paths must use the native deadline' }
    if($script:launchCalls[0].arguments -notmatch ' -S ' -or $script:launchCalls[1].arguments -match ' -S ') { throw 'Reopening DeepSeek must preserve its current conversation' }
} finally { $global:LASTEXITCODE=$savedExitCode }
Write-Output 'DeepSeek bounded launch integration tests passed'
