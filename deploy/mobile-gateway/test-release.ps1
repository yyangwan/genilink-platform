$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File)
$files += @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'handlers') -Filter '*.ps1' -File)
foreach ($file in $files) {
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$parseErrors)
    # Historical offline fixtures without a BOM require PowerShell 7 UTF-8 decoding.
    if ($parseErrors -and $file.Name -notlike 'test-*') { throw "Gateway syntax errors: $($file.Name)" }
}
$tests = @(
    'test-prompt-delivery.ps1',
    'test-popup-guard.ps1', 'test-popup-integration.ps1',
    'test-device-selector.ps1', 'test-device-failure-state.ps1',
    'test-browser-session-readiness.ps1', 'test-gateway-failure-policy.ps1',
    'test-doubao-source-layout.ps1', 'test-kimi-answer-progress.ps1',
    'test-source-only-retry.ps1', 'test-deepseek-source-recovery.ps1',
    'test-yuanbao-duplicate-sources.ps1'
)
foreach ($test in $tests) {
    # Isolate each fixture's functions and mocks in its own process.
    $engine = (Get-Process -Id $PID).Path
    & $engine -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $test)
    if ($LASTEXITCODE -ne 0) { throw "Gateway regression failed: $test" }
}
Write-Output 'Gateway release checks passed.'
