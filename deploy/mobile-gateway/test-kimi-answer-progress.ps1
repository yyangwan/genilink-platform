$ErrorActionPreference = "Stop"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot "handlers\research-app-common.ps1"),
    [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "Handler syntax error: $($errors[0])" }
$names = @(
    "ConvertTo-Xml", "Get-Bounds", "Get-DescendantTexts",
    "Get-KimiAnswerContainer", "Get-AnswerInfo", "Wait-ForAnswer",
    "Get-KimiAnswerSnapshot"
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
function New-AnswerPage {
    param([string[]]$Texts, [switch]$Nested, [switch]$Voice)
    $nodes = ($Texts | ForEach-Object {
        '<node class="android.widget.TextView" text="{0}" />' -f
            [Security.SecurityElement]::Escape($_)
    }) -join ''
    if ($Nested) {
        $nodes = '<node class="android.view.View" clickable="true" bounds="[72,200][1080,700]">' + $nodes + '</node>'
    }
    $voiceNode = if ($Voice) { '<node content-desc="切换至语音输入" />' } else { '' }
    '<hierarchy><node class="android.view.View" clickable="true" bounds="[36,100][1116,1400]">' +
        $nodes + '</node>' + $voiceNode + '</hierarchy>'
}
$Platform = "kimi"
$prompt = "Recommend a coffee kettle"
$progress = "搜索网页 200元以内 手冲咖啡壶 推荐 百元 鹅颈手冲壶 性价比推荐 2026"
$answer = "200元以内，建议选择容量600毫升左右的鹅颈手冲壶，优先考虑控水稳定、握持舒适的款式。"
$progressPage = New-AnswerPage -Texts @($progress) -Voice
Assert-Equal (Get-AnswerInfo -Source $progressPage -Prompt $prompt).answer '' 'Flattened progress rejected'
Assert-Equal (Get-AnswerInfo -Source $progressPage -Prompt $prompt).reference_count 0 'Progress has no references'
foreach ($label in @('搜索网页', '搜索网页：')) {
    $nested = New-AnswerPage -Texts @($label, $progress.Substring(5)) -Nested -Voice
    Assert-Equal (Get-AnswerInfo -Source $nested -Prompt $prompt).answer '' 'Nested query list rejected'
}
$answerPage = New-AnswerPage -Texts @($progress, $answer) -Voice
Assert-Equal (Get-AnswerInfo -Source $answerPage -Prompt $prompt).answer $answer 'Answer survives alongside progress'
$unpunctuatedAnswer = $answer.TrimEnd([char]'。')
$mixedPage = New-AnswerPage -Texts @($progress, $unpunctuatedAnswer) -Voice
Assert-Equal (Get-AnswerInfo -Source $mixedPage -Prompt $prompt).answer $unpunctuatedAnswer 'Separate unpunctuated answer retained'
foreach ($text in @(
    $answer,
    "搜索网页时应核对商品的实际价格和容量，优先选择有完整参数及售后保障的正规渠道。",
    "搜索网页 推荐先比较壶嘴与手柄的设计，再根据容量和预算选择适合自己的手冲咖啡壶。",
    "200元以内 手冲咖啡壶 推荐 百元 鹅颈手冲壶 性价比推荐 2026"
)) {
    $page = New-AnswerPage -Texts @($text) -Voice
    Assert-Equal (Get-AnswerInfo -Source $page -Prompt $prompt).answer $text 'Genuine text retained'
}

# Exercise the real polling/extraction/snapshot path without sleeping or devices.
function Start-Sleep { param($Seconds, $Milliseconds) }
function Get-Date {
    $script:clock = $script:clock.AddSeconds(4)
    $script:clock
}
function Get-PageSource {
    param($SessionId)
    $script:reads++
    if ($script:reads -gt 8) { throw 'Unexpected polling loop' }
    if ($script:progressOnly -or $script:reads -le 3) { return $progressPage }
    $answerPage
}
function Move-ToKimiConversationTop { param($SessionId) Get-PageSource -SessionId $SessionId }
function Get-KimiViewportSignature { param($Source) $Source }
function Get-KimiInlineCards { param($Source) }
function Invoke-KimiConversationSwipe { param($Direction) }
$script:clock = [datetime]'2026-10-20T00:00:00Z'
$script:reads = 0
$script:progressOnly = $false
$result = Wait-ForAnswer -SessionId "offline" -Prompt $prompt -TimeoutSeconds 120
Assert-Equal $result.answer $answer 'Completion waits for answer, snapshot omits progress'
Assert-Equal ($script:reads -ge 6) $true 'Progress did not trigger early snapshot'
Assert-Equal $result.reference_count 0 'No citations remains valid'
Assert-Equal $result.first_token_at ([datetime]'2026-10-20T00:00:20Z') 'Progress is not a first answer token'
$script:clock = [datetime]'2026-10-20T00:00:00Z'
$script:reads = 0
$script:progressOnly = $true
$timedOut = $false
try {
    $null = Wait-ForAnswer -SessionId "offline" -Prompt $prompt -TimeoutSeconds 20
} catch {
    if ($_.Exception.Message -notlike 'Timed out waiting for kimi response*') { throw }
    $timedOut = $true
}
Assert-Equal $timedOut $true 'Progress-only completion times out rather than returning a query'
Write-Output "Kimi answer progress tests passed"
