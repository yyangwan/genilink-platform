$ErrorActionPreference = "Stop"

$root = "C:\ProgramData\MobileGateway"
$runtime = Join-Path $root "appium-runtime"
$appium = Join-Path $runtime "node_modules\.bin\appium.cmd"
$log = Join-Path $root "logs\appium-server.log"

$env:ANDROID_HOME = "C:\Program Files\Android"
$env:ANDROID_SDK_ROOT = "C:\Program Files\Android"
$env:APPIUM_HOME = Join-Path $runtime "appium-home"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:Path = "C:\Program Files\Android\platform-tools;C:\Program Files\nodejs;$runtime\node_modules\.bin;$env:JAVA_HOME\bin;$env:Path"

if (-not (Test-Path $appium)) {
    throw "Appium executable not found at $appium"
}

& $appium server `
    --address 127.0.0.1 `
    --port 4723 `
    --log $log `
    --log-timestamp

exit $LASTEXITCODE
