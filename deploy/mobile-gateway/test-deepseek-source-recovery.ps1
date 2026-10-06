$ErrorActionPreference = "Stop"
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "DeepSeek handler syntax error: $($errors[0])" }
$names = @(
    "Get-PageSource", "New-SourceRecord", "Complete-DeepSeekSourceRecords",
    "Get-DeepSeekExpectedHost", "Get-DeepSeekSources"
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

$savedTemp = $env:TEMP
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("deepseek-recovery-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $env:TEMP = $tempRoot
    $script:deviceSerial = "test-device"
    $Platform = "deepseek"
    $script:dumpCommands = @()
    function Write-GatewayTrace { param([string]$Message) }
    function adb {
        $script:dumpCommands += @($args -join " ")
        $global:LASTEXITCODE = if ($args -contains "dump" -and $args -notcontains "--compressed") { 1 } else { 0 }
        if ($LASTEXITCODE -ne 0) { "NullPointerException in AccessibilityNodeInfoDumper" }
    }
    function Copy-AdbFile {
        param([string]$DevicePath, [string]$LocalPath)
        [IO.File]::WriteAllText($LocalPath, '<hierarchy rotation="0" />')
    }
    Assert-Equal (Get-PageSource -SessionId "adb") '<hierarchy rotation="0" />' "compressed fallback"
    Assert-Equal @($script:dumpCommands | Where-Object {
        $_ -match 'uiautomator dump ' -and $_ -notmatch '--compressed'
    }).Count 3 "normal dump attempts"
    Assert-Equal @($script:dumpCommands | Where-Object { $_ -match 'uiautomator dump --compressed ' }).Count 1 "compressed dump attempt"

    foreach ($otherPlatform in @("yuanbao", "qwen", "kimi")) {
        $Platform = $otherPlatform
        $script:dumpCommands = @()
        Assert-Equal (Get-PageSource -SessionId "adb") '<hierarchy rotation="0" />' "$otherPlatform compressed fallback"
        Assert-Equal @($script:dumpCommands | Where-Object { $_ -match '--compressed' }).Count 1 "$otherPlatform fallback"
    }
    function adb {
        $global:LASTEXITCODE = 137
        "NullPointerException in AccessibilityNodeInfoDumper"
    }
    try {
        Get-PageSource -SessionId "adb" | Out-Null
        throw "Expected both hierarchy modes to fail"
    } catch {
        if ($_.Exception.Message -notmatch 'Android UI hierarchy dump failed .*exit=137') {
            throw
        }
    }
    function adb {
        $script:dumpCommands += @($args -join " ")
        $global:LASTEXITCODE = if ($args -contains "dump" -and $args -notcontains "--compressed") { 1 } else { 0 }
        if ($LASTEXITCODE -ne 0) { "NullPointerException in AccessibilityNodeInfoDumper" }
    }
    $Platform = "deepseek"

    $first = New-SourceRecord -Index 1 -Title "Article" -SiteName "Site" `
        -Domain "example.com" -Url "https://example.com/article" -Resolution "exact"
    $records = @(Complete-DeepSeekSourceRecords -Collected @{ "1" = $first } `
        -ReferenceCount 3 -ErrorMessage "UI hierarchy dump failed")
    Assert-Equal $records.Count 3 "source count"
    Assert-Equal $records[0].url "https://example.com/article" "collected source retained"
    Assert-Equal $records[1].status "failed" "missing source status"
    Assert-Equal $records[2].error_message "UI hierarchy dump failed" "missing source reason"

    function Get-PageSource { throw "Android UI hierarchy dump failed" }
    $missing = @(Get-DeepSeekSources -SessionId "adb" -ReferenceCount 2)
    Assert-Equal $missing.Count 2 "answer survives panel failure"
    Assert-Equal $missing[0].status "failed" "panel failure recorded"

    $script:pageReads = 0
    function Get-PageSource {
        $script:pageReads++
        $marker = "2 $([char]0x4E2A)$([char]0x7F51)$([char]0x9875)"
        switch ($script:pageReads) {
            1 { return "<hierarchy><node text=`"$marker`" /></hierarchy>" }
            2 { return '<hierarchy><node class="android.view.View" clickable="true" /></hierarchy>' }
            { $_ -in @(3, 4) } { return '<hierarchy><node clickable="true" /></hierarchy>' }
            default { throw "Android UI hierarchy dump failed" }
        }
    }
    function ConvertTo-Xml { param([string]$Source) [xml]$Source }
    function Get-Bounds {
        param($Node)
        [pscustomobject]@{ center_x = 100; center_y = 100; left = 900; top = 120; bottom = 450 }
    }
    function Get-DescendantTexts { param($Node) @("1", "Site", "Article") }
    function Click-Point { param($SessionId, $X, $Y) }
    function Get-ResolverUrl { param([string]$ExpectedHost) "https://example.com/article" }
    function ConvertTo-CanonicalUrl { param([string]$Url) $Url }
    function Get-Host { param([string]$Url) "example.com" }
    function Get-ExternalUrlHandlerPackage { $null }
    function Press-Back { param($SessionId) }
    function Return-ToDeepSeekSourcePanel { param($SessionId) }
    $partial = @(Get-DeepSeekSources -SessionId "adb" -ReferenceCount 2)
    Assert-Equal $partial.Count 2 "late dump failure source count"
    Assert-Equal $partial[0].url "https://example.com/article" "late dump preserved exact URL"
    Assert-Equal $partial[1].status "failed" "late dump marked unresolved source"
    Assert-Equal $script:pageReads 5 "late dump failure simulated"
    Write-Output "DeepSeek source recovery tests passed"
} finally {
    $env:TEMP = $savedTemp
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if (-not $resolvedTemp.StartsWith(
        "$resolvedBase\deepseek-recovery-", [StringComparison]::OrdinalIgnoreCase
    )) { throw "Refusing to remove temp path outside $resolvedBase" }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
}
