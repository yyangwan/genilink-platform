param([Parameter(Mandatory)][string]$TaskJson)

$ErrorActionPreference = "Stop"
$browserRoot = $env:MOBILE_GATEWAY_BROWSER_ROOT
$nodePath = $env:MOBILE_GATEWAY_NODE_PATH
if (-not $browserRoot -or -not (Test-Path -LiteralPath (Join-Path $browserRoot "node_modules\playwright-core"))) {
    throw "Qwen browser runtime is not installed"
}
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) {
    throw "Gateway Node.js runtime is unavailable"
}
$workRoot = Join-Path $browserRoot "work"
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
$runId = [guid]::NewGuid().ToString("N")
$taskPath = Join-Path $workRoot "$runId-task.json"
$resultPath = Join-Path $workRoot "$runId-result.json"
try {
    [IO.File]::WriteAllText($taskPath, $TaskJson, [Text.UTF8Encoding]::new($false))
    $scriptPath = Join-Path $browserRoot "qwen-capture.mjs"
    $profilePath = Join-Path $browserRoot "profile"
    # Windows PowerShell otherwise throws on the first stderr line and loses
    # the real Playwright exception and native exit code.
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $nodePath $scriptPath $taskPath $resultPath $profilePath 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
    }
    if ($exitCode -ne 0) {
        $diagnosticPath = "$resultPath-error.json"
        if (Test-Path -LiteralPath $diagnosticPath) {
            $diagnostic = Get-Content -LiteralPath $diagnosticPath -Raw -Encoding UTF8 | ConvertFrom-Json
            throw "$($diagnostic.message) (stage=$($diagnostic.stage); diagnostic=$diagnosticPath)"
        }
        throw "Qwen browser capture failed (exit=$exitCode): $($output -join ' ')"
    }
    if (-not (Test-Path -LiteralPath $resultPath)) {
        throw "Qwen browser capture did not write a result"
    }
    Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
} finally {
    Remove-Item -LiteralPath $taskPath, $resultPath -Force -ErrorAction SilentlyContinue
}
