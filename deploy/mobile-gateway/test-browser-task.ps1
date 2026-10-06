$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gateway-browser-task.ps1')
function Get-Date { $date=$script:base.AddSeconds($script:clock); $script:clock+=5; $date }
function Start-Sleep { param($Milliseconds) }
function New-ScheduledTaskAction { param($Execute,$Argument) $script:workerArguments=$Argument; @{Execute=$Execute} }
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel) $script:principal=@{UserId=$UserId;LogonType=$LogonType;RunLevel=$RunLevel}; @{} }
function New-ScheduledTaskSettingsSet { param($ExecutionTimeLimit,$MultipleInstances) @{} }
function Register-ScheduledTask { param($TaskName,$Action,$Principal,$Settings,$ErrorAction) $script:taskName=$TaskName; if($script:registerFails){throw 'registration failed'} }
function Start-ScheduledTask { param($TaskName,$ErrorAction) if($script:startFails){throw 'start failed'} }
function Get-ScheduledTask { param($TaskName,$ErrorAction) @{State=$script:state} }
function Get-ScheduledTaskInfo { param($TaskName,$ErrorAction) @{LastRunTime=$(if($script:ran){$script:base}else{[datetime]::MinValue});LastTaskResult=$script:exitCode} }
function Stop-ScheduledTask { param($TaskName,$ErrorAction) $script:stopped++ }
function Unregister-ScheduledTask { param($TaskName,$Confirm,$ErrorAction) $script:removed++ }
function Reset-Test {
 $script:base=[datetime]::UtcNow; $script:clock=0; $script:state='Ready'; $script:ran=$true
 $script:exitCode=0; $script:stopped=0; $script:removed=0; $script:startFails=$false; $script:registerFails=$false
}
$arguments=@{NodePath='C:\Program Files\nodejs\node.exe';ScriptPath='C:\runtime\capture.mjs';TaskPath='C:\runtime\task.json';ResultPath='C:\runtime\result.json';ProfilePath='C:\runtime\profile';UserId='yyang'}
Reset-Test
$result=Invoke-InteractiveBrowserCapture @arguments
if($result.ExitCode -ne 0 -or $script:removed -ne 1 -or $script:stopped -ne 0){throw 'Completed worker must return exit code and unregister only its task'}
if($script:principal.UserId -ne 'yyang' -or $script:principal.LogonType -ne 'Interactive' -or $script:principal.RunLevel -ne 'Limited'){throw 'Worker must use login user without stored credentials or elevated browser'}
if($script:workerArguments -ne '"C:\runtime\capture.mjs" "C:\runtime\task.json" "C:\runtime\result.json" "C:\runtime\profile" "headed"'){throw 'Worker arguments must be quoted and use visible browser mode'}
Reset-Test
$script:exitCode=1
if((Invoke-InteractiveBrowserCapture @arguments).ExitCode -ne 1){throw 'Native failure must not be treated as success'}
Reset-Test
$script:ran=$false
try {Invoke-InteractiveBrowserCapture @arguments;throw 'Expected unavailable interactive session'}catch{if($_.Exception.Message -notmatch 'QWEN_INTERACTIVE_SESSION_REQUIRED'){throw}}
if($script:removed -ne 1){throw 'Unavailable session must clean up its registration'}
Reset-Test
$script:state='Running'; $script:exitCode=267009
try {Invoke-InteractiveBrowserCapture @arguments -TimeoutSeconds 10;throw 'Expected worker timeout'}catch{if($_.Exception.Message -notmatch 'QWEN_WORKER_TIMEOUT'){throw}}
if($script:removed -ne 1 -or $script:stopped -ne 1){throw 'Timeout must stop and unregister only the worker task'}
Reset-Test
$script:startFails=$true
try {Invoke-InteractiveBrowserCapture @arguments;throw 'Expected startup failure'}catch{if($_.Exception.Message -ne 'start failed'){throw}}
if($script:removed -ne 1){throw 'Startup failure must unregister created task'}
Reset-Test
$script:registerFails=$true
try {Invoke-InteractiveBrowserCapture @arguments;throw 'Expected registration failure'}catch{if($_.Exception.Message -ne 'registration failed'){throw}}
if($script:removed -ne 0){throw 'Do not remove tasks that were not registered by this worker'}
Write-Output 'Interactive browser worker tests passed'
