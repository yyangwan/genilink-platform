$ErrorActionPreference = "Stop"
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "DeepSeek handler syntax error: $($errors[0])" }
$names = @(
    "Get-ResolverUrl", "Get-DeepSeekExpectedHost", "Get-ResponseTimeoutSeconds"
)
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
}

$script:deviceSerial = "test-device"
function adb {
    @(
        "ActivityRecord dat=https://apify.com/muhammadafzal/ai-geo-rec-tracker",
        "ActivityRecord dat=https://wordpress.org/plugins/llemmy/"
    )
}

Assert-Equal (Get-DeepSeekExpectedHost -SiteName "WordPress.org") `
    "wordpress.org" "known site"
Assert-Equal (Get-DeepSeekExpectedHost -SiteName "aipower.spot") `
    "aipower.spot" "site hostname"
Assert-Equal (Get-DeepSeekExpectedHost -SiteName "Unknown news") `
    $null "unknown site"
Assert-Equal (Get-ResolverUrl -ExpectedHost "wordpress.org") `
    "https://wordpress.org/plugins/llemmy/" "matching host over stale first URL"
Assert-Equal (Get-ResolverUrl -ExpectedHost "missing.example") `
    $null "unmatched host fails closed"
Assert-Equal (Get-ResolverUrl) `
    "https://apify.com/muhammadafzal/ai-geo-rec-tracker" "other callers unchanged"
Assert-Equal (Get-ResponseTimeoutSeconds -PlatformName "deepseek" -RequestedSeconds 420) `
    240 "DeepSeek stalled device cap"
Assert-Equal (Get-ResponseTimeoutSeconds -PlatformName "yuanbao" -RequestedSeconds 420) `
    420 "other platform timeout unchanged"

Write-Output "DeepSeek resolver host tests passed"
