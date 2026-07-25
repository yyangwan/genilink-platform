$ErrorActionPreference = "Continue"

$root = "C:\ProgramData\MobileGateway"
$adb = "C:\Program Files\Android\platform-tools\adb.exe"
$statusFile = Join-Path $root "status.json"

$env:ANDROID_HOME = "C:\Program Files\Android"
$env:ANDROID_SDK_ROOT = "C:\Program Files\Android"
$env:APPIUM_HOME = Join-Path $root "appium-runtime\appium-home"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:Path = "C:\Program Files\Android\platform-tools;C:\Program Files\nodejs;C:\ProgramData\MobileGateway\npm-global;$env:JAVA_HOME\bin;$env:Path"

& $adb start-server 2>$null | Out-Null
$deviceLines = @(
    & $adb devices -l 2>$null |
        Select-Object -Skip 1 |
        Where-Object { $_.Trim() }
)

$devices = @()
foreach ($line in $deviceLines) {
    $parts = $line -split "\s+"
    $properties = @{}

    foreach ($part in $parts | Select-Object -Skip 2) {
        if ($part -match "^([^:]+):(.+)$") {
            $properties[$matches[1]] = $matches[2]
        }
    }

    $devices += [pscustomobject]@{
        serial = $parts[0]
        state = $parts[1]
        model = $properties.model
        product = $properties.product
        device = $properties.device
    }
}

$appiumHealthy = $false
try {
    $response = Invoke-RestMethod "http://127.0.0.1:4723/status" -TimeoutSec 3
    $appiumHealthy = [bool]$response.value.ready
} catch {
    # Appium can be absent while the gateway is first being provisioned.
}

if (-not $appiumHealthy -and (Test-Path (Join-Path $root "appium-runtime\node_modules\.bin\appium.cmd"))) {
    $task = Get-ScheduledTask -TaskName "MobileGateway-Appium" -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne "Running") {
        Start-ScheduledTask -TaskName "MobileGateway-Appium"
    }
}

$disk = Get-Volume -DriveLetter C
$status = [pscustomobject]@{
    gatewayId = $env:COMPUTERNAME
    timestamp = (Get-Date).ToString("o")
    adbHealthy = Test-Path $adb
    appiumHealthy = $appiumHealthy
    devices = $devices
    freeDiskGB = [math]::Round($disk.SizeRemaining / 1GB, 1)
    uptimeSeconds = [int]((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds
}

$temporaryStatusFile = "$statusFile.tmp"
$status | ConvertTo-Json -Depth 5 | Set-Content $temporaryStatusFile -Encoding utf8
Move-Item $temporaryStatusFile $statusFile -Force
