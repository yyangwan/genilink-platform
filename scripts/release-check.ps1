param()

$ErrorActionPreference = "Stop"
$npmCommand = if ($IsWindows -or $env:OS -eq "Windows_NT") { "npm.cmd" } else { "npm" }
$logRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("genilink-release-check-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $logRoot | Out-Null

$steps = @(
    @{ Name = "dependencies"; Command = $npmCommand; Arguments = @("ci") },
    @{ Name = "prisma"; Command = $npmCommand; Arguments = @("run", "db:generate") },
    @{ Name = "types"; Command = "node"; Arguments = @("node_modules/typescript/lib/tsc.js", "--noEmit") },
    @{ Name = "lint"; Command = $npmCommand; Arguments = @("run", "lint") },
    @{ Name = "tests"; Command = $npmCommand; Arguments = @("test") },
    @{ Name = "build"; Command = $npmCommand; Arguments = @("run", "build"); NodeOptions = "--max-old-space-size=4096" }
)

foreach ($step in $steps) {
    $logPath = Join-Path $logRoot ($step.Name + ".log")
    $startedAt = Get-Date
    $previousNodeOptions = $env:NODE_OPTIONS
    if ($step.NodeOptions) {
        $env:NODE_OPTIONS = $step.NodeOptions
    }

    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $step.Command @($step.Arguments) *> $logPath
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        $env:NODE_OPTIONS = $previousNodeOptions
    }

    $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    if ($exitCode -ne 0) {
        Write-Host ("FAIL {0} ({1}s)" -f $step.Name, $elapsed) -ForegroundColor Red
        Get-Content -Path $logPath -Tail 120
        Write-Host ("Full log: {0}" -f $logPath)
        exit $exitCode
    }

    Write-Host ("PASS {0} ({1}s)" -f $step.Name, $elapsed) -ForegroundColor Green
}

Remove-Item -LiteralPath $logRoot -Recurse -Force
Write-Host "Release source gates passed."
