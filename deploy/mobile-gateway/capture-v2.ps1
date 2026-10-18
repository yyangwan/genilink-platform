# Pure output formatting: no platform control, network access, or secrets.
function Get-CaptureField {
    param([object]$Value, [string]$Name, [object]$Default = $null)
    if ($Value -is [Collections.IDictionary]) {
        if ($Value.Contains($Name)) { return $Value[$Name] }
    } elseif ($null -ne $Value -and $Value.PSObject.Properties[$Name]) {
        return $Value.$Name
    }
    return $Default
}

function ConvertTo-CaptureV2 {
    param([object]$Task, [object]$Result)
    $text = [string](Get-CaptureField $Result 'answer' '')
    if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt 200000) { throw 'Capture answer is empty or exceeds the v2 limit' }
    if ($text.Trim() -match '^(?:(?:已完成思考|思考已完成|正在思考|思考中|正在搜索|搜索中)(?:[，,。\s]*(?:参考了\s*\d+\s*篇资料|已阅读\s*\d+\s*个网页))?|参考了\s*\d+\s*篇资料)[。\s]*$') { throw 'Capture answer contains only a UI progress label' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    $observations = @()
    foreach ($source in @(Get-CaptureField $Result 'sources' @())) {
        if ($null -eq $source) { continue }
        $kind = [string](Get-CaptureField $source 'kind' 'unknown')
        if ($kind -notin @('answer_reference','search_candidate','text_link','named_inference','unknown')) { $kind = 'unknown' }
        # Semantics must be supplied by a verified handler. Never infer citations from a count.
        $resolution = [string](Get-CaptureField $source 'url_resolution' 'unknown')
        if ($resolution -notin @('exact','site_root','candidate','unavailable','unknown')) { $resolution = 'unknown' }
        $url = [string](Get-CaptureField $source 'url' '')
        if (-not $url) { $url = $null; if ($resolution -eq 'exact') { $resolution = 'unavailable' } }
        $title = [string](Get-CaptureField $source 'title' (Get-CaptureField $source 'page_title' (Get-CaptureField $source 'site_name' '')))
        $snippet = [string](Get-CaptureField $source 'snippet' (Get-CaptureField $source 'summary' ''))
        if ($title.Length -gt 2000 -or $snippet.Length -gt 4000 -or ($url -and $url.Length -gt 4096)) { throw 'Capture source exceeds v2 limits; nothing was truncated' }
        $observations += @{ ordinal = $observations.Count + 1; kind = $kind; title = $title; url = $url;
            snippet = $snippet; urlResolution = $resolution; answerAnchor = $null }
    }
    if ($observations.Count -gt 200) { throw 'Capture source count exceeds v2 limits' }
    $expected = Get-CaptureField $Result 'reference_count' $null
    if ($null -ne $expected) { $expected = [math]::Max([int]$expected, $observations.Count) }
    $panelStatus = [string](Get-CaptureField $Result 'source_panel_status' 'unknown')
    if ($panelStatus -notin @('complete','partial','unknown','unavailable')) { $panelStatus = 'unknown' }
    # Only actual observed settings are facts; requested Task.payload.conditions are not copied.
    $actual = Get-CaptureField $Result 'observed_conditions' @{}
    $mode = [string](Get-CaptureField $actual 'searchMode' 'unknown')
    if ($mode -notin @('enabled','disabled','unknown')) { $mode = 'unknown' }
    $answerStatus = [string](Get-CaptureField $Result 'answer_status' 'partial')
    if ($answerStatus -notin @('complete','partial')) { $answerStatus = 'partial' }
    return @{ contractVersion = 2; taskId = [string]$Task.id; platform = [string]$Task.platform; surface = [string]$Task.surface;
        observedAt = [datetimeoffset]::UtcNow.ToString('o'); answer = @{ text = $text; status = $answerStatus; contentHash = $hash };
        conditions = @{ searchMode = $mode; modelVersion = (Get-CaptureField $actual 'modelVersion');
            accountClass = (Get-CaptureField $actual 'accountClass'); location = (Get-CaptureField $actual 'location') };
        sources = @($observations); sourcePanel = @{ status = $panelStatus; expectedCount = $expected; capturedCount = $observations.Count };
        adapter = @{ name = "$($Task.platform)-$($Task.surface)"; version = 'capture-v2-1' } }
}
