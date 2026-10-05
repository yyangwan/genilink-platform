$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gateway-share-receiver.ps1")

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
}

$capture = [pscustomobject]@{
    text = "Article https://example.com/a?x=1"
    html_text = $null
    clip_texts = @("https://example.com/a?x=1")
}
Assert-Equal (Get-SharedHttpUrl -Capture $capture) `
    "https://example.com/a?x=1" "single shared URL"

[xml]$chooser = '<hierarchy><node package="com.moonshot.kimichat" text="https://wrong.example/"/><node package="com.huawei.android.internal.app" text="https://example.com/article"/><node package="com.huawei.android.internal.app" text="https://example.com/article"/></hierarchy>'
Assert-Equal (Get-ChooserHttpUrl -Document $chooser) `
    "https://example.com/article" "chooser URL excludes background app"
[xml]$ambiguous = '<hierarchy><node package="com.huawei.android.internal.app" text="https://example.com/a"/><node package="com.huawei.android.internal.app" text="https://example.com/b"/></hierarchy>'
Assert-Equal (Get-ChooserHttpUrl -Document $ambiguous) $null "ambiguous chooser URL"

foreach ($invalid in @(
    [pscustomobject]@{ text = "No URL"; html_text = $null; clip_texts = @() },
    [pscustomobject]@{ text = "javascript:bad"; html_text = $null; clip_texts = @() },
    [pscustomobject]@{
        text = "https://example.com/a https://different.example/b"
        html_text = $null
        clip_texts = @()
    }
)) {
    $failed = $false
    try { Get-SharedHttpUrl -Capture $invalid | Out-Null } catch { $failed = $true }
    Assert-Equal $failed $true "unsafe share rejected"
}

$tokens = $null
$errors = $null
[Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot "gateway-share-receiver.ps1"),
    [ref]$tokens,
    [ref]$errors
) | Out-Null
Assert-Equal $errors.Count 0 "receiver helper syntax"
Write-Output "share receiver tests passed"
