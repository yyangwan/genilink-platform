$ErrorActionPreference = "Stop"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot "handlers\research-app-common.ps1"),
    [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "Handler syntax error: $($errors[0])" }
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in @("Get-DeepSeekAnswerSnapshot", "ConvertTo-Xml", "Get-Bounds")
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}
function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
}
function Start-Sleep { param($Milliseconds) }
function Write-GatewayTrace { param($Message) }
function Get-ForegroundPackage { "com.deepseek.chat" }
function Get-ClipboardText { param($SessionId) "A complete model answer with more than thirty characters." }
function adb {
    if ($args -contains "size") { "Physical size: 1080x2340"; return }
    $script:commands += ($args -join " ")
}
function Get-PageSource {
    param($SessionId)
    $index = [Math]::Min($script:reads, $script:pages.Count - 1)
    $script:reads++
    $script:pages[$index]
}
$script:deviceSerial = "test-device"
$copy = -join @([char]0x590D, [char]0x5236)
$bottom = -join @([char]0x8F6C, [char]0x81F3, [char]0x5E95, [char]0x90E8)
$web = -join @([char]0x4E2A, [char]0x7F51, [char]0x9875)
$complete = "<hierarchy><node content-desc='$copy' bounds='[72,1823][127,1878]'/><node text='17 $web'/></hierarchy>"

$script:reads = 0
$script:commands = @()
$script:pages = @("<hierarchy><node content-desc='$bottom' bounds='[945,1860][1000,1915]'/></hierarchy>", $complete)
$result = Get-DeepSeekAnswerSnapshot -SessionId "adb"
Assert-Equal $script:commands[0] "-s test-device shell input tap 972 1888" "actual bottom control position"
Assert-Equal $result.reference_count 17 "references retained"
Assert-Equal $script:commands.Count 2 "bottom tap followed by copy only"

$script:reads = 0
$script:commands = @()
$script:pages = @($complete)
$result = Get-DeepSeekAnswerSnapshot -SessionId "adb"
Assert-Equal $script:commands.Count 1 "already complete never taps Regenerate"
Assert-Equal $script:reads 1 "already complete single hierarchy read"

$script:reads = 0
$script:commands = @()
$script:pages = @('<hierarchy/>', $complete)
$result = Get-DeepSeekAnswerSnapshot -SessionId "adb"
Assert-Equal ($script:commands[0] -match 'shell input swipe ') $true "missing bottom control uses swipe"
Assert-Equal ($result.answer.Length -gt 30) $true "swipe recovers full answer"

$script:reads = 0
$script:commands = @()
$script:pages = @('<hierarchy/>')
Assert-Equal (Get-DeepSeekAnswerSnapshot -SessionId "adb") $null "unfinished answer keeps waiting"
Write-Output "DeepSeek answer navigation tests passed"
