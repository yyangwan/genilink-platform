param(
    [Parameter(Mandatory)][string]$DeviceSerial,
    [Parameter(Mandatory)][int]$Index,
    [string]$ExpectedTitle,
    [switch]$ResolveDouyin
)

$ErrorActionPreference = "Stop"
$script:deviceSerial = $DeviceSerial
$script:taskWorkingPrefix = "doubao-detail-$([guid]::NewGuid().ToString('N'))"
$packageName = "com.larus.nova"
$resultRoot = "C:\ProgramData\MobileGateway\results"
$sourcePath = Join-Path $PSScriptRoot "handlers\doubao-app.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Doubao handler syntax error: $($errors[0])" }
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

Restore-NativeReferencePanel
$script:doubaoTaskId = Get-DoubaoTaskId
$item = Find-DoubaoSourceNode -Index $Index
if ($ExpectedTitle -and $item.title -ne $ExpectedTitle) {
    throw "Source $Index title mismatch: expected '$ExpectedTitle', found '$($item.title)'"
}
$before = & adb -s $DeviceSerial shell dumpsys activity recents | Out-String
Invoke-NativeNodeTap -Node $item.node
Start-Sleep -Seconds 2
$foreground = Get-ForegroundPackage
$after = & adb -s $DeviceSerial shell dumpsys activity recents | Out-String
$intentUrl = Get-ForegroundIntentUrl -PreviousRecentState $before `
    -RecentState $after -ForegroundPackage $foreground
$shareUrl = if ($ResolveDouyin -and
    $foreground -eq "com.ss.android.ugc.aweme") {
    Get-DouyinSourceShareUrl -ExpectedTitle $item.title
} else { $null }
$uiPath = Join-Path $PSScriptRoot "$($script:taskWorkingPrefix).xml"
Get-NativePageSource | Set-Content -LiteralPath $uiPath -Encoding UTF8
"index=$Index title=$($item.title)"
"foreground=$foreground intent_url=$intentUrl"
"douyin_share_url=$shareUrl"
"ui_path=$uiPath"
