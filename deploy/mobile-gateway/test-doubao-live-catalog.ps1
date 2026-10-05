param([Parameter(Mandatory)][string]$DeviceSerial)

$ErrorActionPreference = "Stop"
$script:deviceSerial = $DeviceSerial
$script:taskWorkingPrefix = "doubao-catalog-$([guid]::NewGuid().ToString('N'))"
$packageName = "com.larus.nova"
$resultRoot = "C:\ProgramData\MobileGateway\results"
$sourcePath = Join-Path $PSScriptRoot "handlers\doubao-app.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Doubao handler syntax error: $($errors[0])" }
$names = @(
    "Get-NativePageSource", "Get-NativeNodeBounds", "Invoke-NativeNodeTap",
    "Get-ReferenceSummary", "Get-VisibleReferenceItems"
)
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

[xml]$document = Get-NativePageSource
$summary = Get-ReferenceSummary -Source $document.OuterXml
for ($attempt = 0; $attempt -lt 18 -and $summary.reference_count -lt 1; $attempt++) {
    $list = $document.SelectSingleNode(
        "//*[@resource-id='$packageName`:id/message_list' and @scrollable='true']"
    )
    if (-not $list) { throw "Doubao scrollable message_list not found" }
    $bounds = Get-NativeNodeBounds -Node $list
    $x = [int]($bounds.right - 100)
    & adb -s $DeviceSerial shell input swipe $x 700 $x 1700 350 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Doubao upward catalog seek failed" }
    Start-Sleep -Milliseconds 500
    [xml]$document = Get-NativePageSource
    $summary = Get-ReferenceSummary -Source $document.OuterXml
}
$title = $document.SelectSingleNode(
    "//*[@resource-id='$packageName`:id/ll_reference_title']"
)
if ($title -and @($document.SelectNodes(
    "//*[@resource-id='$packageName`:id/ll_source_item']"
)).Count -eq 0) {
    Invoke-NativeNodeTap -Node $title
    Start-Sleep -Seconds 1
    [xml]$document = Get-NativePageSource
}

$expandedSummary = Get-ReferenceSummary -Source $document.OuterXml
$summary.reference_count = [math]::Max(
    $summary.reference_count,
    $expandedSummary.reference_count
)
if ($summary.reference_count -lt 1) { throw "Doubao reference count not visible" }
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    $visible = @(Get-VisibleReferenceItems -Source $document.OuterXml)
    if (@($visible | Where-Object { $_.index -eq 1 }).Count -gt 0) { break }
    $list = $document.SelectSingleNode(
        "//*[@resource-id='$packageName`:id/message_list' and @scrollable='true']"
    )
    if (-not $list) { throw "Doubao scrollable message_list not found" }
    $bounds = Get-NativeNodeBounds -Node $list
    $x = [int]($bounds.right - 100)
    & adb -s $DeviceSerial shell input swipe $x 700 $x 1700 350 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Doubao top-of-catalog seek failed" }
    Start-Sleep -Milliseconds 500
    [xml]$document = Get-NativePageSource
}
$seen = @{}
$stalled = 0
for ($page = 0; $page -lt 15 -and $stalled -lt 3; $page++) {
    $before = $seen.Count
    foreach ($item in @(Get-VisibleReferenceItems -Source $document.OuterXml)) {
        $seen[[int]$item.index] = [string]$item.title
    }
    if ($seen.Count -ge $summary.reference_count) { break }
    $list = $document.SelectSingleNode(
        "//*[@resource-id='$packageName`:id/message_list' and @scrollable='true']"
    )
    if (-not $list) { throw "Doubao scrollable message_list not found" }
    $bounds = Get-NativeNodeBounds -Node $list
    $x = [int]($bounds.right - 100)
    $startY = [int][math]::Min($bounds.bottom - 200, $bounds.top + 1150)
    $endY = [int][math]::Max($bounds.top + 250, $startY - 450)
    & adb -s $DeviceSerial shell input swipe $x $startY $x $endY 450 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Doubao catalog swipe failed" }
    Start-Sleep -Milliseconds 700
    [xml]$document = Get-NativePageSource
    $stalled = if ($seen.Count -eq $before) { $stalled + 1 } else { 0 }
}

$missing = @(1..$summary.reference_count | Where-Object { -not $seen.ContainsKey($_) })
$resultPath = Join-Path $PSScriptRoot "$($script:taskWorkingPrefix)-result.json"
@($seen.Keys | Sort-Object | ForEach-Object {
    [pscustomobject]@{ index = [int]$_; title = $seen[$_] }
}) | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $resultPath -Encoding UTF8
"reference_count=$($summary.reference_count) catalog_count=$($seen.Count) missing=$($missing -join ',')"
foreach ($index in @($seen.Keys | Sort-Object)) {
    "source index=$index title=$($seen[$index])"
}
if ($missing.Count -gt 0) { throw "Doubao catalog has missing references" }
"result_path=$resultPath"
