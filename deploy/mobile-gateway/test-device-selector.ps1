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
Assert-Equal (Select-NextDeviceSerial $configured @() "device-a") $null "all offline"
Assert-Equal (Select-NextDeviceSerial @() $online $null) $null "no configuration"

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
