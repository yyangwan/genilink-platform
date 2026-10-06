$ErrorActionPreference='Stop'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'handlers\research-app-common.ps1'),[ref]$null,[ref]$null)
$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Ensure-AndroidDeviceUnlocked'},$true)
. ([scriptblock]::Create($function.Extent.Text))
$script:deviceSerial='test-device'
function Start-Sleep {param($Milliseconds)}
function adb {
    $global:LASTEXITCODE=0
    if($args -contains 'window'){return $script:window}
}
function Get-PageSource {param($SessionId) $script:pageReads++;'<hierarchy/>'}
$script:pageReads=0
$script:window='mDreamingLockscreen=false isStatusBarKeyguard=false'
Ensure-AndroidDeviceUnlocked -SessionId adb
if($script:pageReads -ne 0){throw 'Unlocked device must not dump residual app hierarchy'}
$script:window='unknown window format'
Ensure-AndroidDeviceUnlocked -SessionId adb
if($script:pageReads -ne 1){throw 'Unknown lock state must use conservative fallback'}
$script:window='mDreamingLockscreen=true isStatusBarKeyguard=false'
try {
    Ensure-AndroidDeviceUnlocked -SessionId adb
    throw 'Expected locked device rejection'
} catch {
    if($_.Exception.Message -notmatch 'is locked;'){throw}
}
Write-Output 'Device unlock tests passed'
