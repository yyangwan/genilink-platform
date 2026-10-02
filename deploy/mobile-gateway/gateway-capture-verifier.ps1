$ErrorActionPreference = "Stop"

function Convert-CaptureResult {
    param([object[]]$Output)

    if ($Output.Count -ne 1) {
        throw "Capture handler returned $($Output.Count) results; expected one"
    }
    $result = $Output[0]
    if ($result -is [string]) {
        $result = $result | ConvertFrom-Json -ErrorAction Stop
    }
    if ($null -eq $result -or $null -eq $result.PSObject.Properties["answer"]) {
        throw "Capture handler did not return an answer field"
    }
    return $result
}

function Test-CaptureResult {
    param([object]$Result)

    $answer = [string]$Result.answer
    $referenceCount = [math]::Max(0, [int]$Result.reference_count)
    $sources = @($Result.sources | Where-Object { $null -ne $_ })
    $validCount = 0
    foreach ($source in $sources) {
        $url = [string]$source.url
        $parsed = $null
        if (
            $source.status -eq "collected" -and
            [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$parsed) -and
            $parsed.Scheme -in @("http", "https") -and
            $parsed.Host
        ) {
            $validCount++
        }
    }
    $expectedCount = [math]::Max($referenceCount, $sources.Count)
    $completeness = if ($expectedCount -gt 0) {
        [math]::Min(1.0, $validCount / [double]$expectedCount)
    } else {
        0.0
    }
    $answerPresent = -not [string]::IsNullOrWhiteSpace($answer)
    [pscustomobject]@{
        AnswerPresent = $answerPresent
        ReferenceCount = $referenceCount
        ValidSourceCount = $validCount
        Completeness = $completeness
        Passed = $answerPresent -and $referenceCount -gt 0 -and $completeness -ge 0.9
    }
}

function Invoke-VerifiedCapture {
    param(
        [Parameter(Mandatory)][string]$HandlerPath,
        [Parameter(Mandatory)][string]$SerializedTask,
        [int]$RetryWindowSeconds = 600
    )

    $first = Convert-CaptureResult -Output @(& $HandlerPath -TaskJson $SerializedTask)
    $firstQuality = Test-CaptureResult -Result $first
    if ($firstQuality.Passed) {
        return $first
    }
    Write-Warning "capture check failed: references=$($firstQuality.ReferenceCount) valid_sources=$($firstQuality.ValidSourceCount) completeness=$([math]::Round($firstQuality.Completeness, 4))"

    $task = $SerializedTask | ConvertFrom-Json
    $createdAt = [datetimeoffset]::MinValue
    if ($task.created_at) {
        [datetimeoffset]::TryParse([string]$task.created_at, [ref]$createdAt) | Out-Null
    }
    $ageSeconds = if ($createdAt -eq [datetimeoffset]::MinValue) {
        0
    } else {
        ([datetimeoffset]::UtcNow - $createdAt).TotalSeconds
    }
    if ($ageSeconds -ge $RetryWindowSeconds) {
        Write-Warning "second capture skipped: task age $([math]::Round($ageSeconds))s exceeds retry window ${RetryWindowSeconds}s"
        return $first
    }

    try {
        $task.id = "$($task.id)-verify-2"
        $retryTaskJson = $task | ConvertTo-Json -Depth 30 -Compress
        $retry = Convert-CaptureResult -Output @(& $HandlerPath -TaskJson $retryTaskJson)
        $retryQuality = Test-CaptureResult -Result $retry
        Write-Warning "second capture checked: references=$($retryQuality.ReferenceCount) valid_sources=$($retryQuality.ValidSourceCount) completeness=$([math]::Round($retryQuality.Completeness, 4))"
        if (-not $firstQuality.AnswerPresent -and $retryQuality.AnswerPresent) {
            return $retry
        }
        if (
            $retryQuality.AnswerPresent -and
            $retryQuality.ValidSourceCount -gt $firstQuality.ValidSourceCount
        ) {
            return $retry
        }
        if ($retryQuality.AnswerPresent -and
            $retryQuality.ValidSourceCount -eq $firstQuality.ValidSourceCount -and
            $retryQuality.Completeness -gt $firstQuality.Completeness) {
            return $retry
        }
    } catch {
        Write-Warning "Second capture failed; retaining first result: $($_.Exception.Message)"
    }
    return $first
}
