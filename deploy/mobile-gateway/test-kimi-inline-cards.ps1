param([string]$LiveXmlPath)

$ErrorActionPreference = "Stop"
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Kimi handler has a syntax error: $($errors[0])" }
$names = @(
    "ConvertTo-Xml", "Get-Bounds", "Get-DescendantTexts",
    "Get-KimiAnswerContainer", "Get-KimiInlineCards",
    "Get-KimiPreviewOpenPoint", "Get-UniqueKimiSearchMatch",
    "Get-KimiInlineSources", "Get-KimiAnswerSnapshot"
)
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

$xml = @'
<hierarchy>
  <node class="android.view.View" clickable="true" bounds="[36,100][1116,1200]">
    <node class="android.widget.TextView" text="First answer paragraph with a long citation context" bounds="[100,150][900,280]" />
    <node class="android.view.View" clickable="true" bounds="[140,300][320,430]">
      <node class="android.widget.TextView" text="Birdeye" bounds="[160,320][300,380]" />
    </node>
    <node class="android.widget.TextView" text="Second answer paragraph with a different context" bounds="[100,500][900,630]" />
    <node class="android.view.View" clickable="true" bounds="[140,650][320,780]">
      <node class="android.widget.TextView" text="Birdeye" bounds="[160,670][300,730]" />
    </node>
  </node>
</hierarchy>
'@
$cards = @(Get-KimiInlineCards -Source $xml)
if ($cards.Count -ne 2) { throw "Expected two Birdeye occurrences, got $($cards.Count)" }
if ($cards[0].key -eq $cards[1].key) { throw "Duplicate site labels were collapsed" }
$jitteredXml = $xml.Replace('[140,300][320,430]', '[140,301][320,431]')
$jitteredCards = @(Get-KimiInlineCards -Source $jitteredXml)
if ($cards[0].key -ne $jitteredCards[0].key) {
    throw "One-pixel viewport jitter must not duplicate a citation"
}
$sizes = @([regex]::Matches(
    "Physical size: 1344x2772`nOverride size: 1152x2376", '(\d+)x(\d+)'
)) | Select-Object -Last 1
if ($sizes.Groups[1].Value -ne '1152' -or $sizes.Groups[2].Value -ne '2376') {
    throw "Kimi preview must use the active override size"
}
$preview = [xml]@'
<hierarchy>
  <node class="android.view.View" clickable="true" bounds="[18,1146][1134,2256]">
    <node class="android.widget.TextView" text="quattr.com" bounds="[150,1181][353,1244]" />
    <node class="android.widget.TextView" text="Article title" bounds="[78,1302][1074,1428]" />
  </node>
</hierarchy>
'@
$openPoint = Get-KimiPreviewOpenPoint -Document $preview -SiteName "quattr.com"
if ($openPoint.x -ne 1014 -or $openPoint.y -ne 2006) {
    throw "Kimi preview did not target the card's non-text area"
}
if (Get-KimiPreviewOpenPoint -Document $preview -SiteName "other.example") {
    throw "Kimi preview accepted a mismatched source card"
}
$answerWithSite = [xml]@'
<hierarchy>
  <node class="android.view.View" clickable="true" bounds="[36,100][1116,2256]">
    <node class="android.widget.TextView" text="搜索网页" bounds="[100,300][300,360]" />
    <node class="android.widget.TextView" text="quattr.com" bounds="[150,1181][353,1244]" />
  </node>
</hierarchy>
'@
if (Get-KimiPreviewOpenPoint -Document $answerWithSite -SiteName "quattr.com") {
    throw "Kimi answer was mistaken for a citation preview"
}
$searchCatalog = @(
    [pscustomobject]@{ key = "Yotpo|A"; site_name = "Yotpo" },
    [pscustomobject]@{ key = "MarketersMEDIA|A"; site_name = "MarketersMEDIA" },
    [pscustomobject]@{ key = "MarketersMEDIA|B"; site_name = "MarketersMEDIA" }
)
$uniqueSearchMatch = Get-UniqueKimiSearchMatch `
    -Catalog $searchCatalog -SiteName "Yotpo"
if ($uniqueSearchMatch.key -ne "Yotpo|A") {
    throw "Unique Kimi search source was not matched"
}
if (Get-UniqueKimiSearchMatch -Catalog $searchCatalog -SiteName "MarketersMEDIA") {
    throw "Ambiguous Kimi search source was accepted"
}
function Get-KimiInlineCatalog {
    @(
        [pscustomobject]@{ key = "one"; title = "site.one" },
        [pscustomobject]@{ key = "two"; title = "site.two" }
    )
}
function Find-KimiInlineCard { $null }
function Resolve-KimiInlineSearchFallback { }
function Write-GatewayTrace { param([string]$Message) }
function New-SourceRecord {
    param($Index, $Title, $SiteName, $Domain, $Url, $Resolution, $Status, $ErrorMessage)
    [pscustomobject]@{
        index = $Index
        title = $Title
        status = $Status
        error_message = $ErrorMessage
    }
}
if (@(Get-KimiInlineSources -SessionId "test" -ReferenceCount 0).Count -ne 0) {
    throw "Zero Kimi citations should return no source records"
}
$inlineSources = @(Get-KimiInlineSources -SessionId "test" -ReferenceCount 4)
if ($inlineSources.Count -ne 2) {
    throw "Kimi source count must follow distinct inline occurrences"
}
function Move-ToKimiConversationTop { "first" }
function Get-KimiViewportSignature { param($Source) $Source }
function Get-AnswerInfo { @{ answer = "An answer"; reference_count = 1 } }
function Get-KimiInlineCards {
    [pscustomobject]@{ key = "same-citation" }
}
function Invoke-KimiConversationSwipe { }
function Get-PageSource { "second" }
$snapshot = Get-KimiAnswerSnapshot -SessionId "test" -Prompt "question"
if ($snapshot.reference_count -ne 1) {
    throw "Kimi snapshot counted an overlapping citation twice"
}
if ($LiveXmlPath) {
    $liveCards = @(Get-KimiInlineCards -Source ([IO.File]::ReadAllText(
        $LiveXmlPath, [Text.Encoding]::UTF8
    )))
    "live Kimi cards: $($liveCards.Count)"
    $liveCards | Select-Object key, text, bounds | Format-Table -AutoSize
}
Write-Output "Kimi inline card tests passed"
