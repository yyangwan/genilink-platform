param(
    [Parameter(Mandatory)][string]$DeviceSerial,
    [switch]$OpenPanel
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
    "ConvertTo-Xml", "Get-Bounds", "Get-KimiSearchCards",
    "Get-KimiSearchViewportSignature", "Invoke-KimiSearchPanelSwipe",
    "Get-KimiViewportSignature", "Invoke-KimiConversationSwipe",
    "Move-ToKimiConversationTop", "Test-KimiSearchPanel",
    "Open-KimiSearchPanel", "Move-ToKimiSearchPanelTop"
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

    $devicePath = "/sdcard/kimi-search-$([guid]::NewGuid().ToString('N')).xml"
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

if ($OpenPanel) {
    $null = Open-KimiSearchPanel -SessionId "isolated-catalog"
    $null = Move-ToKimiSearchPanelTop -SessionId "isolated-catalog"
}

$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$views = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$catalog = [Collections.Generic.List[object]]::new()
for ($page = 0; $page -lt 12; $page++) {
    $source = Get-PageSource
    $signature = Get-KimiSearchViewportSignature -Source $source
    if (-not $views.Add($signature)) { break }
    foreach ($card in @(Get-KimiSearchCards -Source $source)) {
        if ($seen.Add($card.key)) { $catalog.Add($card) }
    }
    Invoke-KimiSearchPanelSwipe -Direction up
}
"catalog_count=$($catalog.Count)"
foreach ($card in $catalog) {
    "site=$($card.site_name) title=$($card.title)"
}
