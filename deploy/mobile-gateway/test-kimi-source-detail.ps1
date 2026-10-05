param(
    [Parameter(Mandatory)][string]$DeviceSerial,
    [Parameter(Mandatory)][int]$Index,
    [switch]$OpenArticle
)

$ErrorActionPreference = "Stop"
$script:deviceSerial = $DeviceSerial
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Kimi handler syntax error: $($errors[0])" }
$names = @(
    "ConvertTo-Xml", "Get-Bounds", "Get-DescendantTexts",
    "Get-KimiAnswerContainer", "Get-KimiInlineCards", "Get-KimiViewportSignature",
    "Invoke-KimiConversationSwipe", "Move-ToKimiConversationTop",
    "Get-KimiInlineCatalog", "Find-KimiInlineCard",
    "Get-KimiPreviewOpenPoint"
)
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

function Get-PageSource {
    param([string]$SessionId)

    $devicePath = "/sdcard/kimi-detail-$([guid]::NewGuid().ToString('N')).xml"
    $localPath = Join-Path $env:TEMP ([IO.Path]::GetFileName($devicePath))
    try {
        & adb -s $script:deviceSerial shell uiautomator dump $devicePath 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Kimi UI dump failed" }
        $savedPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & adb -s $script:deviceSerial pull $devicePath $localPath 2>&1 | Out-Null
            $pullExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $savedPreference
        }
        if ($pullExitCode -ne 0) { throw "Kimi UI pull failed" }
        [IO.File]::ReadAllText($localPath, [Text.Encoding]::UTF8)
    } finally {
        Remove-Item -LiteralPath $localPath -Force -ErrorAction SilentlyContinue
        & adb -s $script:deviceSerial shell rm -f $devicePath | Out-Null
    }
}

$catalog = @(Get-KimiInlineCatalog -SessionId "isolated-detail-test")
if ($Index -lt 1 -or $Index -gt $catalog.Count) {
    throw "Kimi citation index $Index is outside catalog count $($catalog.Count)"
}
$item = $catalog[$Index - 1]
$card = Find-KimiInlineCard -SessionId "isolated-detail-test" -Key $item.key
if (-not $card) { throw "Kimi citation $Index could not be located" }
& adb -s $script:deviceSerial shell input tap `
    $card.bounds.center_x $card.bounds.center_y | Out-Null
Start-Sleep -Seconds 2
$source = Get-PageSource -SessionId "isolated-detail-test"
$path = Join-Path $PSScriptRoot "kimi-detail-$Index-$([guid]::NewGuid().ToString('N')).xml"
$source | Set-Content -LiteralPath $path -Encoding UTF8
"catalog_count=$($catalog.Count)"
"index=$Index title=$($item.title)"
"detail_path=$path"
if ($OpenArticle) {
    $point = Get-KimiPreviewOpenPoint `
        -Document (ConvertTo-Xml -Source $source) `
        -SiteName $item.title
    if (-not $point) { throw "Kimi preview did not match its citation" }
    & adb -s $script:deviceSerial shell input tap $point.x $point.y | Out-Null
    Start-Sleep -Seconds 2
    $articleSource = Get-PageSource -SessionId "isolated-detail-test"
    $articlePath = Join-Path $PSScriptRoot `
        "kimi-article-$Index-$([guid]::NewGuid().ToString('N')).xml"
    $articleSource | Set-Content -LiteralPath $articlePath -Encoding UTF8
    "open_point=$($point.x),$($point.y)"
    "article_path=$articlePath"
}
