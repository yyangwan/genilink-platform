$ErrorActionPreference = "Stop"
$packageName = "com.larus.nova"
$sourcePath = Join-Path $PSScriptRoot "handlers\doubao-app.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Doubao handler has a syntax error: $($errors[0])" }
$functions = @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in @(
            "Get-ReferenceSummary", "Complete-DoubaoSourceRecords",
            "Get-NativeNodeBounds", "Get-DoubaoVisibleSourceNodes",
            "Get-DoubaoSourceCatalog", "Find-DoubaoSourceNode",
            "Get-RecentTaskBlock", "Get-RecentTaskUrl",
            "Get-ForegroundIntentUrl", "Get-DouyinSharedUrlFromText",
            "Test-DouyinSourceTitle"
        )
}, $true))
foreach ($function in $functions) {
    . ([scriptblock]::Create($function.Extent.Text))
}

$source = @'
<hierarchy>
  <node resource-id="com.larus.nova:id/search_title" text="&#x641C;&#x7D22; 1 &#x4E2A;&#x5173;&#x952E;&#x8BCD;&#xFF0C;&#x627E;&#x5230; 10 &#x7BC7;&#x8D44;&#x6599;" />
  <node resource-id="com.larus.nova:id/search_title" text="&#x641C;&#x7D22; 1 &#x4E2A;&#x5173;&#x952E;&#x8BCD;&#xFF0C;&#x627E;&#x5230; 10 &#x7BC7;&#x8D44;&#x6599;" />
</hierarchy>
'@
$summary = Get-ReferenceSummary -Source $source
if ($summary.reference_count -ne 20 -or $summary.search_keyword_count -ne 2) {
    throw "Doubao duplicate search batch counts were not retained"
}

$expanded = @'
<hierarchy>
  <node resource-id="com.larus.nova:id/search_title" text="&#x627E;&#x5230; 10 &#x7BC7;&#x8D44;&#x6599;" />
  <node resource-id="com.larus.nova:id/tv_reference_title" text="&#x53C2;&#x8003; 8 &#x7BC7;&#x8D44;&#x6599;" />
</hierarchy>
'@
$summary = Get-ReferenceSummary -Source $expanded
if ($summary.reference_count -ne 8) {
    throw "Expanded reference count did not override the collapsed card"
}
$records = @(
    [pscustomobject]@{ index = 1; title = "first"; status = "collected" },
    [pscustomobject]@{ index = 3; title = "third"; status = "failed" },
    [pscustomobject]@{ index = 3; title = "third"; status = "collected" },
    [pscustomobject]@{ index = 5; title = "fifth"; status = "collected" }
)
$completed = Complete-DoubaoSourceRecords -Records $records -ReferenceCount 5
if ($completed.sources.Count -ne 5 -or
    ($completed.sources.index -join ",") -ne "1,2,3,4,5" -or
    $completed.sources[1].status -ne "failed" -or
    $completed.sources[2].status -ne "collected" -or
    $completed.sources[4].title -ne "fifth") {
    throw "Doubao reference ordinals or missing entries were not preserved"
}

$script:pages = @(
    '<hierarchy><node resource-id="com.larus.nova:id/ll_source_item" bounds="[0,0][100,40]"><node text="1."/><node resource-id="com.larus.nova:id/tv_reference_content" text="First"/></node><node resource-id="com.larus.nova:id/ll_source_item" bounds="[0,40][100,80]"><node text="2."/><node resource-id="com.larus.nova:id/tv_reference_content" text="Second"/></node></hierarchy>',
    '<hierarchy><node resource-id="com.larus.nova:id/ll_source_item" bounds="[0,0][100,40]"><node text="2."/><node resource-id="com.larus.nova:id/tv_reference_content" text="Second"/></node><node resource-id="com.larus.nova:id/ll_source_item" bounds="[0,40][100,80]"><node text="3."/><node resource-id="com.larus.nova:id/tv_reference_content" text="Third"/></node><node resource-id="com.larus.nova:id/ll_source_item" bounds="[0,80][100,120]"><node text="4."/><node resource-id="com.larus.nova:id/tv_reference_content" text="Fourth"/></node></hierarchy>'
)
$script:pageIndex = 0
function Get-NativePageSource { $script:pages[$script:pageIndex] }
function Invoke-DoubaoReferenceSwipe {
    param([xml]$Document, [string]$Direction)
    if ($Direction -eq "up") {
        $script:pageIndex = [math]::Min($script:pageIndex + 1, 1)
    } else {
        $script:pageIndex = [math]::Max($script:pageIndex - 1, 0)
    }
}
$catalog = @(Get-DoubaoSourceCatalog -ReferenceCount 4)
if ($catalog.Count -ne 4 -or
    ($catalog.index -join ",") -ne "1,2,3,4") {
    throw "Doubao catalog omitted or duplicated an ordinal"
}
$script:pageIndex = 0
$fourth = Find-DoubaoSourceNode -Index 4 -Title "Fourth"
if ($fourth.index -ne 4 -or $script:pageIndex -ne 1) {
    throw "Doubao forward ordinal navigation failed"
}
$first = Find-DoubaoSourceNode -Index 1 -Title "First"
if ($first.index -ne 1 -or $script:pageIndex -ne 0) {
    throw "Doubao reverse ordinal navigation failed"
}
$mismatchRejected = $false
try { Find-DoubaoSourceNode -Index 1 -Title "Wrong" | Out-Null } catch {
    $mismatchRejected = $true
}
if (-not $mismatchRejected) { throw "Doubao mismatched source title was accepted" }
$beforeRecents = @'
  * Recent #0: Task{abc #10 type=standard A=10235:com.larus.nova U=0}
    intent={cmp=com.larus.nova/.MainActivity}
  * Recent #1: Task{def #20 type=standard A=10187:com.huawei.browser U=0}
    intent={dat=https://old.example/article cmp=com.huawei.browser/.BrowserMainActivity}
  Visible recent tasks
'@
$staleRecents = @'
  * Recent #0: Task{def #20 type=standard A=10187:com.huawei.browser U=0}
    intent={dat=https://old.example/article cmp=com.huawei.browser/.BrowserMainActivity}
  Visible recent tasks
'@
$freshRecents = $staleRecents.Replace(
    "https://old.example/article", "https://new.example/article"
)
if (Get-ForegroundIntentUrl -PreviousRecentState $beforeRecents `
    -RecentState $staleRecents -ForegroundPackage "com.huawei.browser") {
    throw "Reused browser task returned a stale source URL"
}
$fresh = Get-ForegroundIntentUrl -PreviousRecentState $beforeRecents `
    -RecentState $freshRecents -ForegroundPackage "com.huawei.browser"
if ($fresh -ne "https://new.example/article") {
    throw "Fresh browser intent was not accepted"
}
if (Get-ForegroundIntentUrl -PreviousRecentState $beforeRecents `
    -RecentState $freshRecents -ForegroundPackage "com.larus.nova") {
    throw "Foreground package mismatch returned a source URL"
}
$shareText = "2.05 Copy and open https://v.douyin.com/example123/ via Douyin"
$shareUrl = Get-DouyinSharedUrlFromText -Text $shareText
if ($shareUrl -ne "https://v.douyin.com/example123/") {
    throw "Douyin share URL was not extracted from share text"
}
$wrongDomainRejected = $false
try {
    Get-DouyinSharedUrlFromText -Text "https://example.com/not-douyin" |
        Out-Null
} catch { $wrongDomainRejected = $true }
if (-not $wrongDomainRejected) { throw "Non-Douyin share URL was accepted" }
$douyinPage = [xml]@'
<hierarchy>
  <node package="com.ss.android.ugc.aweme" resource-id="com.ss.android.ugc.aweme:id/desc" text="Sample GEO source title and more details" />
</hierarchy>
'@
if (-not (Test-DouyinSourceTitle -Document $douyinPage -Title "Sample GEO source title")) {
    throw "Matching Douyin source title was rejected"
}
if (Test-DouyinSourceTitle -Document $douyinPage -Title "Unrelated source title") {
    throw "Unrelated Douyin content was accepted"
}
Write-Output "Doubao reference summary tests passed"
