$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gateway-capture-verifier.ps1')
function Assert-Equal { param($Actual,$Expected,$Label) if($Actual -ne $Expected){throw "$Label expected $Expected got $Actual"} }
$script:attempt=0
$result=Invoke-SourceCollectionRetry -Collect {
    $script:attempt++
    @{reference_count=3;sources=@(1..3 | ForEach-Object {
        @{index=$_;title="Source $_";status=$(if($_ -eq $script:attempt){'collected'}else{'failed'});
          url=$(if($_ -eq $script:attempt){"https://example.com/$_"}else{$null});url_resolution='exact'}
    })}
} -MaxAttempts 3
Assert-Equal $script:attempt 3 'source collection passes'
Assert-Equal (Test-CaptureResult ([pscustomobject]@{answer='unchanged answer';reference_count=3;sources=$result.sources})).Passed $true 'complementary sources merged'
$script:attempt=0
$result=Invoke-SourceCollectionRetry -Collect {
    $script:attempt++
    if($script:attempt -eq 2){return @{reference_count=1;sources=@(@{index=1;title='Different article';status='collected';url='https://other.example/a'})}}
    @{reference_count=3;sources=@(@{index=1;title='Original article';status='failed';url=$null})}
}
Assert-Equal $result.reference_count 3 'smaller count never hides missing sources'
Assert-Equal $result.sources[0].status failed 'different source identity cannot replace original'
$script:attempt=0
$result=Invoke-SourceCollectionRetry -Collect {
    $script:attempt++
    if($script:attempt -eq 2){throw 'UI dump failed'}
    @{reference_count=2;sources=@(@{index=1;status='collected';url='https://example.com/a'})}
}
Assert-Equal $result.sources[0].url 'https://example.com/a' 'valid data retained after failure'
Write-Output 'Source-only retry tests passed'

$known=@(@{index=1;title='Article';url='https://example.com/a';status='collected';url_resolution='exact'})
Assert-Equal (Find-KnownSourceRecord $known 1 Article).url 'https://example.com/a' 'same source reused'
Assert-Equal (Find-KnownSourceRecord $known 1 Different) $null 'changed title not reused'
$known[0].url_resolution='site_root'
Assert-Equal (Find-KnownSourceRecord $known 1 Article) $null 'site root is never a resolved citation'

. (Join-Path $PSScriptRoot 'gateway-popup-evidence.ps1')
. (Join-Path $PSScriptRoot 'capture-v2.ps1')
$state = @{ CapturedAnswer = 'Verified current answer'; CapturedAnswerStatus = 'complete'; ReferenceCount = 3 }
$window = Invoke-CaptureReferenceWindow -State $state -StartedAt (Get-Date) -Collect {
    Remember-CaptureSource -State $state -Record ([pscustomobject]@{
        index=1; kind='answer_reference'; title='Article'; status='collected'
        url='https://example.com/a'; url_resolution='exact'
    })
    $state.SourceDeadlineUtc = [datetime]::UtcNow.AddSeconds(-1)
    Get-CaptureOperationTimeout -Seconds 5 -State $state
}
$task = @{ id='test'; platform='kimi'; surface='app' }
$capture = ConvertTo-CaptureV2 -Task $task -Result $window.retained
Assert-Equal $capture.answer.text 'Verified current answer' 'reference timeout keeps current answer'
Assert-Equal $capture.answer.status 'complete' 'answer completion is independent of source coverage'
Assert-Equal $capture.sourcePanel.status 'partial' 'incomplete references are visible'
Assert-Equal $capture.sourcePanel.expectedCount 3 'reference coverage retains known denominator'
Assert-Equal $capture.sources[0].url 'https://example.com/a' 'resolved reference survives interruption'
Assert-Equal ($state.ContainsKey('SourceDeadlineUtc')) $false 'reference deadline does not affect cleanup'

try {
    Invoke-CaptureReferenceWindow -State $state -StartedAt (Get-Date) -Collect {
        throw 'CAPTURE_POPUP_MANUAL_REQUIRED'
    } | Out-Null
    throw 'Manual popup should retain its intervention path'
} catch {
    if ($_.Exception.Message -ne 'CAPTURE_POPUP_MANUAL_REQUIRED') { throw }
}
