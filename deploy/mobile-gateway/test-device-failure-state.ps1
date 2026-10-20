$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'gateway-device-selector.ps1')
$directory = Join-Path ([IO.Path]::GetTempPath()) ('gateway-state-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory | Out-Null
$path = Join-Path $directory 'device-failures.json'
try {
    $first = New-CaptureDeviceFailure -Serial phone-a -Platform deepseek -TaskId task-a -Message timeout
    Save-CaptureDeviceFailures -Path $path -Failures @($first)
    $second = New-CaptureDeviceFailure -Serial phone-b -Platform kimi -TaskId task-b -Message 'UI hierarchy dump failed'
    Save-CaptureDeviceFailures -Path $path -Failures @($first, $second)
    $saved = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if (@($saved).Count -ne 2 -or $saved[1].Serial -ne 'phone-b') { throw 'Existing cooldown state was not replaced correctly' }
    $loaded = @(Read-CaptureDeviceFailures -Path $path)
    if ($loaded.Count -ne 2 -or $loaded[0] -is [array]) { throw 'Restart must load flat failure records in Windows PowerShell 5.1' }
    if (@(Get-CaptureExcludedSerials -Failures $loaded -Platform deepseek -TaskId task-c).Count -ne 2) { throw 'Loaded failure records must work with eligibility checks' }
    Save-CaptureDeviceFailures -Path $path -Failures @()
    if (([IO.File]::ReadAllText($path) -replace '\s', '') -ne '[]') { throw 'Empty cooldown state must remain an array' }
    if (@(Get-ChildItem -LiteralPath $directory -Filter '*.tmp').Count) { throw 'Temporary state files leaked' }
    Write-Output 'Device failure persistence tests passed'
} finally {
    $resolved = [IO.Path]::GetFullPath($directory)
    $temporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($temporary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
