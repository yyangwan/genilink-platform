$ErrorActionPreference = "Stop"
$sourcePath = Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count) { throw "Yuanbao handler syntax error: $($errors[0])" }
$names = @("New-SourceRecord", "Complete-YuanbaoDuplicateSources")
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -in $names
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

function Write-GatewayTrace { param([string]$Message) }
function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label expected '$Expected', got '$Actual'" }
}

$records = @(
    (New-SourceRecord -Index 1 -Title "Same article" -SiteName "example.com" `
        -Domain "example.com" -Url "https://example.com/article" -Resolution "exact")
    (New-SourceRecord -Index 2 -Title "Same article" -SiteName "example.com" `
        -Domain $null -Url $null -Resolution "unavailable" -Status "failed" `
        -ErrorMessage "Share receiver target not visible in chooser")
    (New-SourceRecord -Index 3 -Title "Later article" -SiteName "other.example" `
        -Domain $null -Url $null -Resolution "unavailable" -Status "failed" `
        -ErrorMessage "Yuanbao source item was not exposed after paging")
    (New-SourceRecord -Index 4 -Title "Later article" -SiteName "other.example" `
        -Domain "other.example" -Url "https://other.example/later" -Resolution "exact")
)
$recovered = @(Complete-YuanbaoDuplicateSources -Records $records)
Assert-Equal $recovered.Count 4 "record count"
Assert-Equal $recovered[1].url "https://example.com/article" "earlier peer URL"
Assert-Equal $recovered[1].url_resolution "exact" "earlier peer resolution"
Assert-Equal $recovered[1].status "collected" "earlier peer status"
Assert-Equal $recovered[1].error_message $null "earlier peer error cleared"
Assert-Equal $recovered[2].url "https://other.example/later" "later peer URL"
Assert-Equal $recovered[2].status "collected" "later peer status"

$ambiguous = @(
    (New-SourceRecord -Index 1 -Title "Same title" -SiteName "example.com" `
        -Domain "example.com" -Url "https://example.com/one" -Resolution "exact")
    (New-SourceRecord -Index 2 -Title "Same title" -SiteName "example.com" `
        -Domain "example.com" -Url "https://example.com/two" -Resolution "exact")
    (New-SourceRecord -Index 3 -Title "Same title" -SiteName "example.com" `
        -Domain $null -Url $null -Resolution "unavailable" -Status "failed")
    (New-SourceRecord -Index 4 -Title "Same title" -SiteName "different.example" `
        -Domain $null -Url $null -Resolution "unavailable" -Status "failed")
)
$unresolved = @(Complete-YuanbaoDuplicateSources -Records $ambiguous)
Assert-Equal $unresolved[2].status "failed" "ambiguous peer remains failed"
Assert-Equal $unresolved[3].status "failed" "different site remains failed"

Write-Output "Yuanbao duplicate source recovery tests passed"
