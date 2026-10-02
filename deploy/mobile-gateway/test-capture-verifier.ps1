$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gateway-capture-verifier.ps1")

function Assert-Equal {
    param([object]$Actual, [object]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "$Label expected '$Expected' but got '$Actual'"
    }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("gateway-verifier-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $parseErrors = $null
    foreach ($path in @(
        "gateway-agent.ps1",
        "gateway-capture-verifier.ps1",
        "install-gateway-agent.ps1",
        "test-capture-verifier.ps1"
    )) {
        $tokens = $null
        [Management.Automation.Language.Parser]::ParseFile(
            (Join-Path $PSScriptRoot $path),
            [ref]$tokens,
            [ref]$parseErrors
        ) | Out-Null
        if ($parseErrors.Count -gt 0) {
            throw "PowerShell syntax error in ${path}: $($parseErrors[0])"
        }
    }

    $handlerPath = Join-Path $tempRoot "fake-handler.ps1"
    @'
param([string]$TaskJson)
$task = $TaskJson | ConvertFrom-Json
$countPath = Join-Path $PSScriptRoot "attempts.txt"
$attempts = if (Test-Path $countPath) { [int](Get-Content $countPath) } else { 0 }
$attempts++
Set-Content -LiteralPath $countPath -Value $attempts
$sources = if ($task.payload.mode -eq "retry_fewer" -and $attempts -eq 1) {
    @(1..9 | ForEach-Object { @{ status = "collected"; url = "https://example.com/$_" } })
} elseif ($task.payload.mode -eq "complete") {
    @(@{ status = "collected"; url = "https://example.com/a" })
} elseif ($attempts -eq 1) {
    @(@{ status = "failed"; url = $null })
} elseif ($task.payload.mode -eq "retry_fails") {
    throw "retry failed"
} else {
    @(@{ status = "collected"; url = "https://example.com/b" })
}
@{
    answer = "A real answer"
    reference_count = if ($task.payload.mode -eq "retry_fewer" -and $attempts -eq 1) { 17 } else { 1 }
    sources = $sources
    source_path = $task.id
} | ConvertTo-Json -Depth 10 -Compress
'@ | Set-Content -LiteralPath $handlerPath -Encoding UTF8

    $task = @{ id = "test-task"; created_at = [datetimeoffset]::UtcNow.ToString("o"); payload = @{ mode = "complete" } }
    $result = Invoke-VerifiedCapture -HandlerPath $handlerPath -SerializedTask ($task | ConvertTo-Json -Depth 10)
    Assert-Equal (Get-Content (Join-Path $tempRoot "attempts.txt")) 1 "complete attempts"
    Assert-Equal $result.source_path "test-task" "complete selection"

    Remove-Item -LiteralPath (Join-Path $tempRoot "attempts.txt")
    $task.payload.mode = "retry_succeeds"
    $result = Invoke-VerifiedCapture -HandlerPath $handlerPath -SerializedTask ($task | ConvertTo-Json -Depth 10)
    Assert-Equal (Get-Content (Join-Path $tempRoot "attempts.txt")) 2 "incomplete attempts"
    Assert-Equal $result.source_path "test-task-verify-2" "retry selection"
    Assert-Equal (Test-CaptureResult -Result $result).Passed $true "retry quality"

    Remove-Item -LiteralPath (Join-Path $tempRoot "attempts.txt")
    $task.payload.mode = "retry_fails"
    $result = Invoke-VerifiedCapture -HandlerPath $handlerPath -SerializedTask ($task | ConvertTo-Json -Depth 10) -WarningAction SilentlyContinue
    Assert-Equal $result.source_path "test-task" "first result retained"

    Remove-Item -LiteralPath (Join-Path $tempRoot "attempts.txt")
    $task.payload.mode = "retry_fewer"
    $result = Invoke-VerifiedCapture -HandlerPath $handlerPath -SerializedTask ($task | ConvertTo-Json -Depth 10) -WarningAction SilentlyContinue
    Assert-Equal $result.source_path "test-task" "more sources retained over smaller denominator"

    Remove-Item -LiteralPath (Join-Path $tempRoot "attempts.txt")
    $task.created_at = [datetimeoffset]::UtcNow.AddMinutes(-11).ToString("o")
    $result = Invoke-VerifiedCapture -HandlerPath $handlerPath -SerializedTask ($task | ConvertTo-Json -Depth 10)
    Assert-Equal (Get-Content (Join-Path $tempRoot "attempts.txt")) 1 "expired retry window"

    $quality = Test-CaptureResult -Result ([pscustomobject]@{
        answer = "A real answer"
        reference_count = 2
        sources = @(
            [pscustomobject]@{ status = "collected"; url = "https://example.com/a" },
            [pscustomobject]@{ status = "collected"; url = "javascript:bad" }
        )
    })
    Assert-Equal $quality.Passed $false "invalid URL quality"
    Assert-Equal $quality.Completeness 0.5 "valid URL completeness"

    Remove-Item -LiteralPath (Join-Path $tempRoot "attempts.txt")
    $task.created_at = [datetimeoffset]::UtcNow.ToString("o")
    $task.payload.mode = "retry_succeeds"
    $job = Start-Job -ScriptBlock {
        param($VerifierPath, $HandlerPath, $TaskJson)
        . $VerifierPath
        Invoke-VerifiedCapture -HandlerPath $HandlerPath -SerializedTask $TaskJson
    } -ArgumentList @(
        (Join-Path $PSScriptRoot "gateway-capture-verifier.ps1"),
        $handlerPath,
        ($task | ConvertTo-Json -Depth 10)
    )
    try {
        $job | Wait-Job | Out-Null
        $warnings = @()
        $output = @(Receive-Job -Job $job -ErrorAction Stop -WarningVariable warnings -WarningAction SilentlyContinue)
        Assert-Equal $job.State "Completed" "background job state"
        Assert-Equal $output.Count 1 "background job output count"
        Assert-Equal $output[0].source_path "test-task-verify-2" "background job selection"
        if ($warnings.Count -lt 2) {
            throw "Background job verification warnings were not captured"
        }
    } finally {
        Remove-Job -Job $job -Force
    }
    Write-Output "capture verifier tests passed"
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
