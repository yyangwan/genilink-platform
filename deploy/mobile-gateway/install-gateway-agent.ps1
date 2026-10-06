param(
    [Parameter(Mandatory)]
    [string]$BaseUrl,
    [Parameter(Mandatory)]
    [string]$GatewayId,
    [Parameter(Mandatory)]
    [string]$Token,
    [string[]]$DeviceSerials = @(),
    [int]$MaxConcurrentTasks = 0,
    [string]$ShareReceiverDeviceSerial = "",
    [string[]]$ShareReceiverDeviceSerials = @()
)

$ErrorActionPreference = "Stop"
$allowedShareSerials = @(@($ShareReceiverDeviceSerials) + @($ShareReceiverDeviceSerial) |
    Where-Object { $_ } | Select-Object -Unique)
foreach ($serial in $allowedShareSerials) {
    if ($serial.Contains(',') -or $serial -cnotin $DeviceSerials) {
        throw "Share receiver serial '$serial' is not in the configured device pool"
    }
}
$root = "C:\ProgramData\MobileGateway"
$configDirectory = Join-Path $root "config"
$handlerRoot = Join-Path $root "handlers"
$configPath = Join-Path $configDirectory "gateway-agent.json"
$agentPath = Join-Path $root "gateway-agent.ps1"
$sourceAgent = Join-Path $PSScriptRoot "gateway-agent.ps1"
$deviceSelectorPath = Join-Path $root "gateway-device-selector.ps1"
$sourceDeviceSelector = Join-Path $PSScriptRoot "gateway-device-selector.ps1"
$verifierPath = Join-Path $root "gateway-capture-verifier.ps1"
$sourceVerifier = Join-Path $PSScriptRoot "gateway-capture-verifier.ps1"
$shareReceiverPath = Join-Path $root "gateway-share-receiver.ps1"
$sourceShareReceiver = Join-Path $PSScriptRoot "gateway-share-receiver.ps1"
$httpClientPath = Join-Path $root "gateway-http-client.mjs"
$sourceHttpClient = Join-Path $PSScriptRoot "gateway-http-client.mjs"
$sourceHandlerRoot = Join-Path $PSScriptRoot "handlers"
$browserRoot = Join-Path $root "browser-runtime"
$sourceBrowserRoot = Join-Path $PSScriptRoot "browser-runtime"

New-Item -ItemType Directory -Path $configDirectory, $handlerRoot -Force | Out-Null
if ([IO.Path]::GetFullPath($sourceAgent) -ne [IO.Path]::GetFullPath($agentPath)) {
    Copy-Item -LiteralPath $sourceAgent -Destination $agentPath -Force
}
if ([IO.Path]::GetFullPath($sourceDeviceSelector) -ne [IO.Path]::GetFullPath($deviceSelectorPath)) {
    Copy-Item -LiteralPath $sourceDeviceSelector -Destination $deviceSelectorPath -Force
}
if ([IO.Path]::GetFullPath($sourceVerifier) -ne [IO.Path]::GetFullPath($verifierPath)) {
    Copy-Item -LiteralPath $sourceVerifier -Destination $verifierPath -Force
}
if ([IO.Path]::GetFullPath($sourceShareReceiver) -ne [IO.Path]::GetFullPath($shareReceiverPath)) {
    Copy-Item -LiteralPath $sourceShareReceiver -Destination $shareReceiverPath -Force
}
if ([IO.Path]::GetFullPath($sourceHttpClient) -ne [IO.Path]::GetFullPath($httpClientPath)) {
    Copy-Item -LiteralPath $sourceHttpClient -Destination $httpClientPath -Force
}
if (Test-Path -LiteralPath $sourceHandlerRoot) {
    Copy-Item `
        -Path (Join-Path $sourceHandlerRoot "*.ps1") `
        -Destination $handlerRoot `
        -Force
}
if (Test-Path -LiteralPath $sourceBrowserRoot) {
    New-Item -ItemType Directory -Path $browserRoot -Force | Out-Null
    foreach ($name in @("package.json", "package-lock.json", "qwen-capture.mjs", "qwen-extract.mjs", "qwen-state.mjs")) {
        Copy-Item -LiteralPath (Join-Path $sourceBrowserRoot $name) -Destination $browserRoot -Force
    }
    $npm = "C:\Program Files\nodejs\npm.cmd"
    if (-not (Test-Path -LiteralPath $npm)) { throw "Node.js npm is required for browser runtime" }
    & $npm ci --omit=dev --prefix $browserRoot
    if ($LASTEXITCODE -ne 0) { throw "Browser runtime dependency install failed" }
}

@{
    baseUrl = $BaseUrl.TrimEnd("/")
    gatewayId = $GatewayId
    token = $Token
    deviceSerials = @($DeviceSerials)
    capabilities = @("gateway.healthcheck", "appium.prompt", "browser.prompt")
    handlerRoot = $handlerRoot
    nodePath = "C:\Program Files\nodejs\node.exe"
    httpClientPath = $httpClientPath
    browserRoot = $browserRoot
    pollIntervalSeconds = 5
    maxConcurrentTasks = $MaxConcurrentTasks
    shareReceiverDeviceSerials = @($allowedShareSerials)
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8

$acl = Get-Acl -LiteralPath $configPath
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators")) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        "FullControl",
        "Allow"
    )
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $configPath -AclObject $acl

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$agentPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([timespan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName "MobileGateway-Agent" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null
Start-ScheduledTask -TaskName "MobileGateway-Agent"
