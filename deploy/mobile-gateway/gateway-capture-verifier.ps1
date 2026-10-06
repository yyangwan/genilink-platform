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
            (-not $source.url_resolution -or $source.url_resolution -eq "exact") -and
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

    Write-Warning "partial result retained; source-only retries run inside the collector, never replay the prompt"
    return $first
}

function Invoke-SourceCollectionRetry {
    param([Parameter(Mandatory)][scriptblock]$Collect,
        [int]$MaxAttempts = 2, [int]$RetryWindowSeconds = 1800)
    $started = [datetime]::UtcNow
    $result = & $Collect -KnownSources @()
    $records = @{}
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        foreach ($record in @($result.sources)) {
            $key = [string]$record.index
            if (-not $key) { throw "Source-only retry requires stable source indices" }
            $existing = $records[$key]
            $recordQuality = Test-CaptureResult -Result ([pscustomobject]@{
                answer = 'source'; reference_count = 1; sources = @($record)
            })
            $existingQuality = if ($existing) {
                Test-CaptureResult -Result ([pscustomobject]@{
                    answer = 'source'; reference_count = 1; sources = @($existing)
                })
            } else { $null }
            if (-not $existing -or (-not $existingQuality.Passed -and $recordQuality.Passed -and
                (-not $existing.title -or -not $record.title -or $existing.title -eq $record.title))) {
                $records[$key] = $record
            }
        }
        $result.sources = @($records.Values | Sort-Object { [int]$_.index })
        $result.reference_count = [math]::Max([int]$result.reference_count, $result.sources.Count)
        $quality = Test-CaptureResult -Result ([pscustomobject]@{
            answer = 'source'; reference_count = $result.reference_count; sources = $result.sources
        })
        Write-Warning "source-only check attempt=$attempt references=$($result.reference_count) valid_sources=$($quality.ValidSourceCount) completeness=$([math]::Round($quality.Completeness,4))"
        if ($quality.Passed -or $attempt -ge $MaxAttempts -or
            ([datetime]::UtcNow - $started).TotalSeconds -ge $RetryWindowSeconds) { break }
        try {
            $retry = & $Collect -KnownSources @($records.Values)
            $retry.reference_count = [math]::Max([int]$result.reference_count, [int]$retry.reference_count)
            $result = $retry
        } catch {
            Write-Warning "source-only retry failed; keeping collected sources: $($_.Exception.Message)"
            break
        }
    }
    return $result
}

function Find-KnownSourceRecord {
    param([object[]]$Records, [int]$Index, [string]$Title)
    foreach ($record in $Records) {
        if ([int]$record.index -eq $Index -and $Title -and $record.title -eq $Title) {
            $quality = Test-CaptureResult -Result ([pscustomobject]@{
                answer='source'; reference_count=1; sources=@($record)
            })
            if ($quality.Passed) { return $record }
        }
    }
    return $null
}
