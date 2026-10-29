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

$partialRoot=Join-Path ([IO.Path]::GetTempPath()) ('MobileGatewayPartial-'+[guid]::NewGuid().ToString('N'))
$taskKey='partial-test-task'
$partialDir=Join-Path (Join-Path $partialRoot $taskKey) 'interruptions'
New-Item -ItemType Directory -Path $partialDir -Force|Out-Null
$partialFile=Join-Path $partialDir 'event-partial.json'
$started=[datetime]::UtcNow.AddSeconds(-3)
try {
    $artifact=@{status='interrupted';task_id=$taskKey;reason='unknown_dialog';answer='Observed assistant answer before a source download dialog';reference_count=0;sources=@(@{index=1;title='Saved source';url='https://example.com/article';url_resolution='exact';status='collected'});cookie='do-not-copy'}
    [IO.File]::WriteAllText($partialFile,($artifact|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $saved=Read-InterruptedCapture -ResultRoot $partialRoot -TaskId $taskKey -StartedAt $started
    if(-not $saved -or $saved.answer -cne $artifact.answer -or $saved.sources.Count -ne 1) { throw 'Interrupted answer/source data must be retained for its exact task' }
    if($saved.answer_status -ne 'partial' -or $null -ne $saved.source_panel_expected_count -or $saved.PSObject.Properties['cookie']) { throw 'Recovery cannot invent completion, denominator or copy private fields' }
    . (Join-Path $PSScriptRoot 'capture-v2.ps1')
    $wire=ConvertTo-CaptureV2 -Task ([pscustomobject]@{id=$taskKey;platform='doubao';surface='app'}) -Result $saved
    if($wire.sourcePanel.status -ne 'partial' -or $null -ne $wire.sourcePanel.expectedCount -or $wire.sources[0].kind -ne 'unknown') { throw 'Recovered facts must preserve uncertainty in the strict contract' }
    (Get-Item -LiteralPath $partialFile).LastWriteTimeUtc=$started.AddSeconds(-10)
    if(Read-InterruptedCapture -ResultRoot $partialRoot -TaskId $taskKey -StartedAt $started) { throw 'A previous job artifact must not be recovered' }
    $artifact.task_id='another-task';[IO.File]::WriteAllText($partialFile,($artifact|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    if(Read-InterruptedCapture -ResultRoot $partialRoot -TaskId $taskKey -StartedAt $started) { throw 'A different task artifact must not be recovered' }
    $artifact.task_id=$taskKey;$artifact.answer_status='complete';$artifact.reference_count=3
    [IO.File]::WriteAllText($partialFile,($artifact|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $saved=Read-InterruptedCapture -ResultRoot $partialRoot -TaskId $taskKey -StartedAt $started
    if($saved.answer_status -ne 'complete' -or $saved.source_panel_expected_count -ne 3) { throw 'Explicit observed answer completion must survive a source-only interruption' }
    $artifact.answer='';[IO.File]::WriteAllText($partialFile,($artifact|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    if(Read-InterruptedCapture -ResultRoot $partialRoot -TaskId $taskKey -StartedAt $started) { throw 'An empty artifact cannot complete a capture' }
    if(Read-InterruptedCapture -ResultRoot $partialRoot -TaskId '../unsafe' -StartedAt $started) { throw 'A task cannot escape the result root' }

    # Exercise the real completion catch path with an interrupted job. No
    # collector, device, browser or network is invoked by these mocks.
    $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Complete-ActiveTask'},$true)
    # AST extraction does not retain the original script's automatic root.
    $boundRoot="'"+$PSScriptRoot.Replace("'","''")+"'"
    . ([scriptblock]::Create($definition.Extent.Text.Replace('$PSScriptRoot',$boundRoot)))
    $root=Join-Path $partialRoot 'agent-root'
    $agentEvidence=Join-Path (Join-Path (Join-Path $root 'results') $taskKey) 'interruptions'
    New-Item -ItemType Directory -Path $agentEvidence -Force|Out-Null
    $artifact.answer='Observed interrupted answer';$artifact.answer_status='complete';$artifact.reference_count=3
    [IO.File]::WriteAllText((Join-Path $agentEvidence 'retained-partial.json'),($artifact|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    function Receive-Job { [CmdletBinding()] param($Job) throw 'CAPTURE_POPUP_MANUAL_REQUIRED' }
    function Remove-Job { [CmdletBinding()] param($Job,[switch]$Force) }
    function New-CaptureDeviceFailure { param($Serial,$Platform,$TaskId,$Message) $script:cooldownRecorded=$true;[pscustomobject]@{Until=[datetimeoffset]::UtcNow.AddMinutes(1);TaskUntil=[datetimeoffset]::UtcNow.AddMinutes(1)} }
    function Save-CaptureDeviceFailures { param($Path,$Failures) }
    function Invoke-GatewayApi { param($Method,$Path,$Body) $script:delivered=@{path=$Path;body=$Body} }
    $script:completionLogs=@()
    function Write-AgentLog { param($Message) $script:completionLogs+=$Message }
    $script:deviceFailures=@();$script:cooldownRecorded=$false;$deviceFailurePath=Join-Path $partialRoot 'unused'
    $capturedTask=[pscustomobject]@{id=$taskKey;platform='doubao';surface='app';payload=[pscustomobject]@{capture_contract_version=2}}
    $failedJob=[pscustomobject]@{State='Failed';PSBeginTime=$started}
    $script:activeTasks=@{}
    $script:activeTasks[$taskKey]=@{Job=$failedJob;Task=$capturedTask;LeaseToken='current-lease';DeviceSerial='test-device'}
    Remove-Item -LiteralPath Function:\Read-InterruptedCapture -Force
    Complete-ActiveTask -TaskId $taskKey
    if($script:delivered.path -notlike '*/complete' -or $script:delivered.body.lease_token -ne 'current-lease' -or $script:delivered.body.result.answer.text -cne $artifact.answer) { throw ('An interrupted v2 job must deliver its retained facts under the current lease: '+($script:completionLogs -join ' | ')) }
    if($script:delivered.body.result.sourcePanel.status -ne 'partial' -or -not $script:cooldownRecorded -or $script:activeTasks.ContainsKey($taskKey)) { throw 'Partial delivery must retain intervention cooldown and release the worker slot' }
    $capturedTask.payload.capture_contract_version=1
    $script:activeTasks[$taskKey]=@{Job=$failedJob;Task=$capturedTask;LeaseToken='legacy-lease';DeviceSerial='test-device'}
    Complete-ActiveTask -TaskId $taskKey
    if($script:delivered.path -notlike '*/fail') { throw 'A collector without the uncertainty contract cannot masquerade as completed' }
} finally {
    $absolute=[IO.Path]::GetFullPath($partialRoot)
    $temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
    if(-not $absolute.StartsWith($temporary+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Refuse cleanup outside the explicit temporary root' }
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
Write-Output 'Interrupted capture provenance and retained-data tests passed'
