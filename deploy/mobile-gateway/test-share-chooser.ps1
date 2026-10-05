param(
    [Parameter(Mandatory)][string]$DeviceSerial,
    [int]$SystemPort = 8299,
    [int]$MjpegServerPort = 9299,
    [switch]$Resolve
)

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:4723"
$body = @{
    capabilities = @{
        alwaysMatch = @{
            platformName = "Android"
            "appium:automationName" = "UiAutomator2"
            "appium:deviceName" = $DeviceSerial
            "appium:udid" = $DeviceSerial
            "appium:noReset" = $true
            "appium:skipDeviceInitialization" = $true
            "appium:skipServerInstallation" = $true
            "appium:systemPort" = $SystemPort
            "appium:mjpegServerPort" = $MjpegServerPort
        }
        firstMatch = @(@{})
    }
} | ConvertTo-Json -Depth 10
$session = Invoke-RestMethod -Method Post -Uri "$base/session" `
    -Body $body -ContentType "application/json" -TimeoutSec 60
$id = [string]$session.value.sessionId
if (-not $id) { throw "Appium did not start a test session" }
try {
    if ($Resolve) {
        . (Join-Path $PSScriptRoot "gateway-share-receiver.ps1")
        $env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL = $DeviceSerial
        "resolved: $(Invoke-ShareReceiverOnOpenSheet -Serial $DeviceSerial -SessionId $id -Platform 'kimi')"
        return
    }
    Invoke-RestMethod -Method Post -Uri "$base/session/$id/appium/settings" `
        -Body '{"settings":{"enableMultiWindows":true}}' `
        -ContentType "application/json" -TimeoutSec 30 | Out-Null
    . (Join-Path $PSScriptRoot "gateway-share-receiver.ps1")
    [xml]$document = Get-AppiumUtf8PageSource -SessionId $id
    $packages = @($document.SelectNodes("//*[@package]")) |
        ForEach-Object { $_.GetAttribute("package") } | Sort-Object -Unique
    $labels = @($document.SelectNodes("//*[@text or @content-desc]")) |
        ForEach-Object { $_.GetAttribute("text"); $_.GetAttribute("content-desc") } |
        Where-Object { $_ } | Sort-Object -Unique
    "packages: $($packages -join ', ')"
    "labels: $($labels -join ' | ')"
    "native-more-count: $(@($document.SelectNodes("//*[@text='更多' or @content-desc='更多']")).Count)"
    foreach ($node in @($document.SelectNodes("//*[@text and @package]"))) {
        if ($node.GetAttribute("text") -match '^https?://') {
            "url package=$($node.GetAttribute('package')) bounds=$($node.GetAttribute('bounds')) text=$($node.GetAttribute('text'))"
        }
    }
} finally {
    Invoke-RestMethod -Method Delete -Uri "$base/session/$id" -TimeoutSec 30 | Out-Null
}
