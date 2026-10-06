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
    if ($env:MOBILE_GATEWAY_BROWSER_USER) {
        . (Join-Path (Split-Path $PSScriptRoot -Parent) "gateway-browser-task.ps1")
        $task = $TaskJson | ConvertFrom-Json
        $answerTimeout = [int]$task.payload.timeout_seconds
        if ($answerTimeout -le 0) { $answerTimeout = 420 }
        $worker = Invoke-InteractiveBrowserCapture -NodePath $nodePath -ScriptPath $scriptPath `
            -TaskPath $taskPath -ResultPath $resultPath -ProfilePath $profilePath `
            -UserId $env:MOBILE_GATEWAY_BROWSER_USER `
            -TimeoutSeconds ([math]::Min(600, [math]::Max(30, $answerTimeout)) + 180)
        $output = $worker.Output
        $exitCode = $worker.ExitCode
    } else {
        $savedPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $output = & $nodePath $scriptPath $taskPath $resultPath $profilePath 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $savedPreference
        }
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
