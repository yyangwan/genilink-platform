$ErrorActionPreference = "Stop"
foreach ($entry in @(
    @{ path = (Join-Path $PSScriptRoot "handlers\doubao-app.ps1"); names = @("Test-DoubaoRetryableSourceError") },
    @{ path = (Join-Path $PSScriptRoot "handlers\research-app-common.ps1"); names = @("Get-UniqueKimiSearchMatch") }
)) {
    $tokens = $null
    $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($entry.path, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "Syntax error in $($entry.path): $($errors[0])" }
    foreach ($function in @($ast.FindAll({
        param($node)
        $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $entry.names
    }, $true))) {
        . ([scriptblock]::Create($function.Extent.Text))
    }
}
if (-not (Test-DoubaoRetryableSourceError -Message "Copy Link did not update the clipboard")) {
    throw "Transient clipboard failure must be retried"
}
if (Test-DoubaoRetryableSourceError -Message "PDF download opened instead of source page") {
    throw "Deterministic PDF failure must not be retried"
}
$catalog = @(
    [pscustomobject]@{ site_name = "site"; title = "article title alpha" },
    [pscustomobject]@{ site_name = "site"; title = "article title beta" }
)
$exact = Get-UniqueKimiSearchMatch -Catalog $catalog -SiteName "site" -Context "cites article title beta today"
if ($exact.title -ne "article title beta") { throw "Kimi context did not select the exact article" }
if (Get-UniqueKimiSearchMatch -Catalog $catalog -SiteName "site" -Context "no title") {
    throw "Ambiguous Kimi source must remain unresolved"
}
"citation policy tests passed"
