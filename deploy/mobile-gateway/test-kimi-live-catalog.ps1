param([Parameter(Mandatory)][string]$DeviceSerial)

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
    "Invoke-KimiConversationSwipe", "Move-ToKimiConversationTop", "Get-KimiInlineCatalog"
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

    $name = "kimi-live-$([guid]::NewGuid().ToString('N')).xml"
    $devicePath = "/sdcard/$name"
    $localPath = Join-Path $env:TEMP $name
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
        return [IO.File]::ReadAllText($localPath, [Text.Encoding]::UTF8)
    } finally {
        Remove-Item -LiteralPath $localPath -Force -ErrorAction SilentlyContinue
        & adb -s $script:deviceSerial shell rm -f $devicePath | Out-Null
    }
}

$cards = @(Get-KimiInlineCatalog -SessionId "isolated-live-test")
"catalog_count=$($cards.Count)"
foreach ($card in $cards) {
    "card=$($card.title) key=$($card.key)"
}
