$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gateway-device-selector.ps1")

function Assert-Equal {
    param([object]$Actual, [object]$Expected, [string]$Case)

    if ($Actual -ne $Expected) {
        throw "$Case`: expected '$Expected', got '$Actual'"
    }
}

$configured = @("device-a", "device-b", "device-c", "device-d")
$online = @("device-a", "device-c", "device-d")

Assert-Equal (Select-NextDeviceSerial $configured $online $null) "device-a" "first assignment"
Assert-Equal (Select-NextDeviceSerial $configured $online "device-a") "device-c" "skip offline"
Assert-Equal (Select-NextDeviceSerial $configured $online "device-c") "device-d" "advance"
Assert-Equal (Select-NextDeviceSerial $configured $online "device-d") "device-a" "wrap"
Assert-Equal (
    Select-NextDeviceSerial $configured $online "device-a" @("device-c")
) "device-d" "skip busy"
Assert-Equal (Select-NextDeviceSerial $configured @() "device-a") $null "all offline"
Assert-Equal (Select-NextDeviceSerial @() $online $null) $null "no configuration"

$ports = Get-DeviceAppiumPorts $configured "device-c"
Assert-Equal $ports.systemPort 8202 "stable system port"
Assert-Equal $ports.mjpegServerPort 9202 "stable mjpeg port"

$idle = @(Get-IdleDeviceSerials $configured $online @("device-c"))
Assert-Equal $idle.Count 2 "idle device count"
Assert-Equal $idle[0] "device-a" "first idle device"
Assert-Equal $idle[1] "device-d" "second idle device"
Assert-Equal (Get-GatewayConcurrencyLimit $configured 0) 4 "device-count concurrency"
Assert-Equal (Get-GatewayConcurrencyLimit $configured 2) 2 "configured concurrency cap"
Assert-Equal (Get-GatewayConcurrencyLimit @() 0) 1 "empty-pool concurrency fallback"

$adbLines = @(
    "List of devices attached",
    "device-a device product:one",
    "device-b offline transport_id:2",
    "device-c unauthorized",
    "device-d device"
)
$authorized = @(Get-AuthorizedDeviceSerials $adbLines)
Assert-Equal $authorized.Count 2 "authorized count"
Assert-Equal $authorized[0] "device-a" "first authorized"
Assert-Equal $authorized[1] "device-d" "second authorized"

Write-Output "Gateway device selection tests passed"

$now = [datetime]::UtcNow
$failure = New-CaptureDeviceFailure -Serial device-a -Platform deepseek -TaskId task-1 `
    -Message 'Timed out waiting for response' -Now $now
Assert-Equal (Get-CaptureExcludedSerials @($failure) deepseek task-2 $now) device-a 'same platform cooldown'
Assert-Equal @(Get-CaptureExcludedSerials @($failure) kimi task-2 $now).Count 0 'other platform remains usable'
Assert-Equal (Get-CaptureExcludedSerials @($failure) deepseek task-1 $now.AddMinutes(30)) device-a 'same task never repeats failed phone'
Assert-Equal @(Get-CaptureExcludedSerials @($failure) deepseek task-2 $now.AddMinutes(30)).Count 0 'platform cooldown expires'
$globalFailure = New-CaptureDeviceFailure device-c kimi task-3 'Android UI hierarchy dump failed' $now
Assert-Equal (Get-CaptureExcludedSerials @($globalFailure) deepseek task-4 $now) device-c 'hierarchy failure quarantines all apps'
Assert-Equal @(Get-CaptureExcludedSerials @($globalFailure) deepseek task-4 $now.AddHours(2)).Count 0 'expired quarantine recovers'
