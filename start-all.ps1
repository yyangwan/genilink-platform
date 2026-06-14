$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$scriptPath = Join-Path $repoRoot 'start-all.sh'

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing startup script: $scriptPath"
}

if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
    throw 'No bash runtime found. Install WSL or Git Bash, then rerun this wrapper.'
}

Set-Location $repoRoot
& bash ./start-all.sh @args
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    throw "start-all wrapper exited with code $exitCode"
}

return $exitCode
