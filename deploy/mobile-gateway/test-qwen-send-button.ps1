$LiveXmlPath = if ($args.Count -gt 0) { [string]$args[0] } else { $null }
$ErrorActionPreference = "Stop"
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Qwen handler syntax error: $($errors[0])" }
$names = @(
    "ConvertTo-Xml", "Get-Bounds", "Get-SendButtonBounds", "Get-AnswerInfo",
    "Get-QwenResearchSourceTitles"
)
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

function Get-PageSource { param([string]$SessionId) $script:fixture }

$script:fixture = @'
<hierarchy>
  <node class="android.widget.EditText" text="test prompt" bounds="[36,1980][1104,2118]" />
  <node class="android.view.View" clickable="true" bounds="[1005,1836][1152,1944]" />
  <node class="android.view.View" clickable="true" bounds="[856,2134][974,2252]" />
  <node class="android.view.View" clickable="true" bounds="[974,2134][1092,2252]" />
</hierarchy>
'@
$send = Get-SendButtonBounds -SessionId "fixture" -TargetPlatform "qwen"
if ($send.left -ne 974 -or $send.top -ne 2134) {
    throw "Qwen send selector picked a feature shortcut instead of the send button"
}

$Platform = "qwen"
$script:fixture = @'
<hierarchy>
  <node class="android.widget.TextView" text="Unrelated suggestion shown on the home page" bounds="[60,800][900,900]" />
</hierarchy>
'@
$answer = Get-AnswerInfo -Source $script:fixture -Prompt "test prompt"
if ($answer.answer) { throw "Qwen home suggestion was accepted as an answer" }
if ($LiveXmlPath) {
    [xml]$live = [IO.File]::ReadAllText($LiveXmlPath, [Text.Encoding]::UTF8)
    $titles = @(Get-QwenResearchSourceTitles -Document $live)
    "live_qwen_title_count=$($titles.Count)"
    $titles | Select-Object -First 5
}
Write-Output "Qwen send and answer guard tests passed"
