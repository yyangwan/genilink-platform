$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gateway-browser-task.ps1')
$script:calls=0
function quser.exe {
    param($UserName)
    $script:calls++
    $script:queriedUser=$UserName
    if ($script:queryFails) { throw 'session query unavailable' }
    $global:LASTEXITCODE=$script:exitCode
}
if (-not (Test-InteractiveBrowserSession) -or $script:calls) { throw 'Headless legacy configuration should not query interactive sessions' }
$script:exitCode=0
if (-not (Test-InteractiveBrowserSession -UserId 'CHAO\yyang') -or $script:queriedUser -ne 'yyang') { throw 'Active and locked signed-in sessions must remain eligible' }
$script:exitCode=1
if (Test-InteractiveBrowserSession -UserId yyang) { throw 'Signed-out browser user must not claim tasks' }
$script:queryFails=$true
if (Test-InteractiveBrowserSession -UserId yyang) { throw 'Session query failure must fail closed' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Session check changed caller error policy' }
Write-Output 'Browser session readiness tests passed'
