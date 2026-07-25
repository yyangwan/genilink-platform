param(
    [Parameter(Mandatory)]
    [string]$BaseUrl,
    [Parameter(Mandatory)]
    [string]$GatewayId,
    [Parameter(Mandatory)]
    [string]$Token
)

$ErrorActionPreference = "Stop"
$root = "C:\ProgramData\MobileGateway"
$configDirectory = Join-Path $root "config"
$handlerRoot = Join-Path $root "handlers"
$configPath = Join-Path $configDirectory "gateway-agent.json"
$agentPath = Join-Path $root "gateway-agent.ps1"
$sourceAgent = Join-Path $PSScriptRoot "gateway-agent.ps1"
$httpClientPath = Join-Path $root "gateway-http-client.mjs"
$sourceHttpClient = Join-Path $PSScriptRoot "gateway-http-client.mjs"

New-Item -ItemType Directory -Path $configDirectory, $handlerRoot -Force | Out-Null
if ([IO.Path]::GetFullPath($sourceAgent) -ne [IO.Path]::GetFullPath($agentPath)) {
    Copy-Item -LiteralPath $sourceAgent -Destination $agentPath -Force
}
if ([IO.Path]::GetFullPath($sourceHttpClient) -ne [IO.Path]::GetFullPath($httpClientPath)) {
    Copy-Item -LiteralPath $sourceHttpClient -Destination $httpClientPath -Force
}

@{
    baseUrl = $BaseUrl.TrimEnd("/")
    gatewayId = $GatewayId
    token = $Token
    capabilities = @("gateway.healthcheck")
    handlerRoot = $handlerRoot
    nodePath = "C:\Program Files\nodejs\node.exe"
    httpClientPath = $httpClientPath
    pollIntervalSeconds = 5
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
