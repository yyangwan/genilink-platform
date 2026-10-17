$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'capture-v2.ps1')
$task = [pscustomobject]@{ id = 'task-id'; platform = 'qwen'; surface = 'web'; payload = @{ conditions = @{ searchMode = 'enabled' } } }
$raw = [pscustomobject]@{ answer = '中文🧭原文'; sources = @([pscustomobject]@{ title = '文章'; url = 'https://example.com/article'; url_resolution = 'exact'; snippet = '来源摘要' }); cookie = 'test-secret-only' }
$result = ConvertTo-CaptureV2 -Task $task -Result $raw
if ($result.contractVersion -ne 2 -or $result.answer.text -cne $raw.answer) { throw 'Answer preservation failed' }
if ($result.conditions.searchMode -ne 'unknown') { throw 'Requested conditions were promoted to observed facts' }
if ($result.sources[0].kind -ne 'unknown' -or $result.sources[0].snippet -ne '来源摘要') { throw 'Source facts changed' }
if ($result.ContainsKey('cookie')) { throw 'Private cookie leaked' }
$sha = [Security.Cryptography.SHA256]::Create()
try { $expected = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($raw.answer)))).Replace('-', '').ToLowerInvariant() }
finally { $sha.Dispose() }
if ($expected -ne $result.answer.contentHash) { throw 'UTF-8 hash mismatch' }
$raw.sources = @()
$empty = ConvertTo-CaptureV2 -Task $task -Result $raw
if ($empty.sources.Count -ne 0 -or $empty.sourcePanel.capturedCount -ne 0) { throw 'Empty source list is not preserved' }
$raw.answer = 'x' * 200001
$rejected = $false
try { ConvertTo-CaptureV2 -Task $task -Result $raw | Out-Null } catch { $rejected = $true }
if (-not $rejected) { throw 'Oversized answer was not rejected' }
'Capture-v2 formatting checks passed'
