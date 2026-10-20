$ErrorActionPreference = "Stop"
$packageName = "com.larus.nova"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot "handlers/doubao-app.ps1"), [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "Doubao handler syntax error: $($errors[0])" }
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in @("Get-NativeNodeBounds", "Get-DoubaoVisibleSourceNodes",
            "Get-DoubaoReferenceScrollContainer", "Invoke-DoubaoReferenceSwipe")
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

# Load definitions only. Never execute the handler or an external phone command.
$script:swipes = @()
function adb {
    $script:swipes += ,@($args)
    $global:LASTEXITCODE = 0
}
function Start-Sleep { param($Milliseconds) }
$script:deviceSerial = "fixture-only"

function New-SourceLayout {
    param([string]$Id = "recyclerView", [string]$Bounds = "[0,1376][1080,2238]",
        [string]$Scrollable = "true", [string]$Marker = "ll_source_item")
    [xml]"<hierarchy><node resource-id='$packageName`:id/$Id' class='androidx.recyclerview.widget.RecyclerView' scrollable='$Scrollable' bounds='$Bounds'><node resource-id='$packageName`:id/$Marker' /></node></hierarchy>"
}

$checked = 0
foreach ($id in @("recyclerView", "message_list")) {
    foreach ($geometry in @("[0,1376][1080,2238]", "[0,200][1080,2200]",
        "[20,100][80,180]", "[10,20][13,23]")) {
        $document = New-SourceLayout -Id $id -Bounds $geometry
        $container = Get-DoubaoReferenceScrollContainer -Document $document
        if (-not $container -or $container.GetAttribute("resource-id") -ne "$packageName`:id/$id") {
            throw "Source container not selected: $id $geometry"
        }
        $bounds = Get-NativeNodeBounds -Node $container
        foreach ($direction in @("up", "down")) {
            $before = $script:swipes.Count
            Invoke-DoubaoReferenceSwipe -Document $document -Direction $direction
            if ($script:swipes.Count -ne $before + 1) { throw "Expected one mocked swipe" }
            $swipe = $script:swipes[-1]
            if (($swipe[0..4] -join " ") -ne "-s fixture-only shell input swipe") {
                throw "Unexpected swipe command"
            }
            $x1, $y1, $x2, $y2 = $swipe[5..8]
            if ($x1 -le $bounds.left -or $x1 -ge $bounds.right -or
                $x2 -ne $x1 -or $y1 -le $bounds.top -or $y1 -ge $bounds.bottom -or
                $y2 -le $bounds.top -or $y2 -ge $bounds.bottom -or
                ($direction -eq "up" -and $y1 -le $y2) -or
                ($direction -eq "down" -and $y1 -ge $y2)) {
                throw "Swipe escaped viewport, reversed or collapsed: $id $geometry $direction"
            }
            $checked++
        }
    }
}

$missingBounds = New-SourceLayout
$missingBounds.SelectSingleNode("/hierarchy/node").RemoveAttribute("bounds")
$invalid = @(
    $missingBounds,
    [xml]"<hierarchy />",
    (New-SourceLayout -Bounds ""),
    (New-SourceLayout -Bounds "bad"),
    (New-SourceLayout -Bounds "[0,0][0,0]"),
    (New-SourceLayout -Bounds "[100,200][50,150]"),
    (New-SourceLayout -Bounds "[-1,20][100,200]"),
    (New-SourceLayout -Bounds "[0,0][1,100]"),
    (New-SourceLayout -Bounds "[0,0][100,2]"),
    (New-SourceLayout -Bounds "[0,0][999999999999,200]"),
    (New-SourceLayout -Scrollable "false"),
    (New-SourceLayout -Marker "input_text"),
    (New-SourceLayout -Id "unrelated_list"),
    [xml]"<hierarchy><node resource-id='$packageName`:id/tv_reference_title'/><node resource-id='$packageName`:id/message_list' scrollable='true' bounds='[0,0][1080,2400]'/></hierarchy>"
)
foreach ($document in $invalid) {
    if (Get-DoubaoReferenceScrollContainer -Document $document) {
        throw "Unsafe source container selected"
    }
    foreach ($direction in @("up", "down")) {
        $before = $script:swipes.Count
        $rejected = $false
        try { Invoke-DoubaoReferenceSwipe -Document $document -Direction $direction } catch {
            $rejected = $true
        }
        if (-not $rejected -or $script:swipes.Count -ne $before) {
            throw "Unsafe layout did not fail before swipe"
        }
        $checked++
    }
}

# A generic recyclerView must not shadow the actual legacy source container.
[xml]$mixed = '<hierarchy><node resource-id="com.larus.nova:id/recyclerView" scrollable="true" bounds="[0,0][1080,1000]"/><node resource-id="com.larus.nova:id/message_list" scrollable="true" bounds="[0,1376][1080,2238]"><node resource-id="com.larus.nova:id/tv_reference_title"/></node></hierarchy>'
if ((Get-DoubaoReferenceScrollContainer -Document $mixed).GetAttribute("resource-id") -ne
    "$packageName`:id/message_list") { throw "Unrelated recyclerView shadowed sources" }

# Synthetic structural fixture, not a copy of audit text or artifacts.
[xml]$visible = '<hierarchy><node resource-id="com.larus.nova:id/recyclerView" scrollable="true" bounds="[0,1376][1080,2238]"><node resource-id="com.larus.nova:id/tv_reference_title"/><node resource-id="com.larus.nova:id/ll_source_item" bounds="[10,1670][1070,1727]"><node resource-id="com.larus.nova:id/tv_reference_index" text="1."/><node resource-id="com.larus.nova:id/tv_reference_content" text="Fixture"/></node></node></hierarchy>'
$items = @(Get-DoubaoVisibleSourceNodes -Document $visible)
if ($items.Count -ne 1 -or $items[0].index -ne 1 -or $items[0].title -ne "Fixture") {
    throw "New container broke visible source parsing"
}
"PASS: $checked swipe safety cases; scoped selection and visible-source parsing"
