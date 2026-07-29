param(
    [string]$ConfigPath = "C:\ProgramData\MobileGateway\config\gateway-agent.json"
)

$ErrorActionPreference = "Stop"
$root = "C:\ProgramData\MobileGateway"
$logPath = Join-Path $root "logs\gateway-agent.log"
$statusPath = Join-Path $root "status.json"
$mutex = [Threading.Mutex]::new($false, "Global\MobileGatewayAgent")

if (-not $mutex.WaitOne(0)) {
    throw "Another gateway agent instance is already running"
}

function Write-AgentLog {
    param([string]$Message)

    $line = "{0} {1}" -f (Get-Date).ToString("o"), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Invoke-GatewayApi {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body
    )

    $request = @{
        url = $script:config.baseUrl.TrimEnd("/") + $Path
        method = $Method
        gatewayId = $script:config.gatewayId
        token = $script:config.token
        body = $Body
    }
    $requestJson = $request | ConvertTo-Json -Depth 30 -Compress
    $requestId = [guid]::NewGuid().ToString("N")
    $tempDirectory = Join-Path $root "temp"
    $requestPath = Join-Path $tempDirectory "$requestId-request.json"
    $responsePath = Join-Path $tempDirectory "$requestId-response.json"
    New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null
    try {
        [IO.File]::WriteAllText(
            $requestPath,
            $requestJson,
            [Text.UTF8Encoding]::new($false)
        )
        $output = & $script:config.nodePath `
            $script:config.httpClientPath `
            $requestPath `
            $responsePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Gateway API request failed: $($output -join [Environment]::NewLine)"
        }
        if (-not (Test-Path -LiteralPath $responsePath)) {
            throw "Gateway API response file was not created"
        }
        $responseJson = [IO.File]::ReadAllText(
            $responsePath,
            [Text.Encoding]::UTF8
        )
        $responseJson | ConvertFrom-Json
    } finally {
        Remove-Item -LiteralPath $requestPath, $responsePath -Force -ErrorAction SilentlyContinue
    }
}

function Get-DeviceSnapshot {
    if (-not (Test-Path -LiteralPath $statusPath)) {
        return @{ statusFilePresent = $false; devices = @() }
    }
    try {
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        return @{
            statusFilePresent = $true
            adbHealthy = [bool]$status.adbHealthy
            appiumHealthy = [bool]$status.appiumHealthy
            devices = @($status.devices)
            freeDiskGB = $status.freeDiskGB
            uptimeSeconds = $status.uptimeSeconds
        }
    } catch {
        return @{
            statusFilePresent = $true
            statusReadError = $_.Exception.Message
            devices = @()
        }
    }
}

function Send-Heartbeat {
    $snapshot = Get-DeviceSnapshot
    $degraded = -not ($snapshot.adbHealthy -and $snapshot.appiumHealthy)
    Invoke-GatewayApi -Method Post -Path "/api/device-gateway/heartbeat" -Body @{
        display_name = $env:COMPUTERNAME
        status = if ($degraded) { "degraded" } else { "online" }
        capabilities = @{ taskTypes = @($script:config.capabilities) }
        device_snapshot = $snapshot
        agent_version = "0.2.0"
    } | Out-Null
    $script:lastHeartbeat = Get-Date
}

function Invoke-AppiumTask {
    param([pscustomobject]$Task, [string]$LeaseToken)

    if ($Task.platform -notmatch "^[a-z0-9_-]+$" -or $Task.surface -notmatch "^(web|app)$") {
        throw "Invalid platform or surface in task"
    }
    $handler = Join-Path $script:config.handlerRoot "$($Task.platform)-$($Task.surface).ps1"
    if (-not (Test-Path -LiteralPath $handler)) {
        $errorRecord = [Management.Automation.ErrorRecord]::new(
            [InvalidOperationException]::new("Handler not installed: $handler"),
            "handler_not_installed",
            [Management.Automation.ErrorCategory]::ObjectNotFound,
            $handler
        )
        throw $errorRecord
    }

    $taskJson = $Task | ConvertTo-Json -Depth 30 -Compress
    $job = Start-Job -FilePath $handler -ArgumentList $taskJson
    try {
        while ($job.State -in @("NotStarted", "Running")) {
            Wait-Job -Job $job -Timeout 30 | Out-Null
            if ($job.State -in @("NotStarted", "Running")) {
                Invoke-GatewayApi `
                    -Method Post `
                    -Path "/api/device-gateway/tasks/$($Task.id)/heartbeat" `
                    -Body @{ lease_token = $LeaseToken } | Out-Null
            }
        }
        $output = @(Receive-Job -Job $job)
        if ($job.State -ne "Completed") {
            throw "Handler failed with state $($job.State)"
        }
        if ($output.Count -eq 1) {
            $cleanResult = [ordered]@{}
            foreach ($property in $output[0].PSObject.Properties) {
                if (
                    $property.Name -notin @(
                        "PSComputerName",
                        "RunspaceId",
                        "PSShowComputerName"
                    )
                ) {
                    $cleanResult[$property.Name] = $property.Value
                }
            }
            return $cleanResult
        }
        return @{ output = $output }
    } finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-ClaimedTask {
    param([pscustomobject]$Claim)

    $task = $Claim.task
    $leaseToken = $Claim.lease_token
    try {
        if ($task.task_type -eq "gateway.healthcheck") {
            $result = @{
                gatewayId = $script:config.gatewayId
                completedAt = (Get-Date).ToString("o")
                status = Get-DeviceSnapshot
                echo = $task.payload
            }
        } elseif ($task.task_type -eq "appium.prompt") {
            $result = Invoke-AppiumTask -Task $task -LeaseToken $leaseToken
        } else {
            throw "Unsupported task type: $($task.task_type)"
        }

        Invoke-GatewayApi `
            -Method Post `
            -Path "/api/device-gateway/tasks/$($task.id)/complete" `
            -Body @{ lease_token = $leaseToken; result = $result } | Out-Null
        Write-AgentLog "completed task=$($task.id) type=$($task.task_type)"
    } catch {
        $code = if ($_.FullyQualifiedErrorId -like "handler_not_installed*") {
            "handler_not_installed"
        } else {
            "gateway_execution_failed"
        }
        try {
            Invoke-GatewayApi `
                -Method Post `
                -Path "/api/device-gateway/tasks/$($task.id)/fail" `
                -Body @{
                    lease_token = $leaseToken
                    error_code = $code
                    error_message = $_.Exception.Message
                    retryable = $code -ne "handler_not_installed"
                    retry_after_seconds = 30
                } | Out-Null
        } catch {
            Write-AgentLog "failed to report task=$($task.id): $($_.Exception.Message)"
        }
        Write-AgentLog "failed task=$($task.id) code=$code"
    }
}

try {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "Gateway agent config not found: $ConfigPath"
    }
    $script:config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $requiredValues = @(
        "baseUrl",
        "gatewayId",
        "token",
        "capabilities",
        "handlerRoot",
        "nodePath",
        "httpClientPath"
    )
    foreach ($required in $requiredValues) {
        if ($null -eq $script:config.$required) {
            throw "Missing gateway agent config value: $required"
        }
    }

    $script:lastHeartbeat = [datetime]::MinValue
    Write-AgentLog "agent started gateway=$($script:config.gatewayId)"
    while ($true) {
        try {
            if (((Get-Date) - $script:lastHeartbeat).TotalSeconds -ge 30) {
                Send-Heartbeat
            }
            $claim = Invoke-GatewayApi `
                -Method Post `
                -Path "/api/device-gateway/tasks/claim" `
                -Body @{ capabilities = @($script:config.capabilities) }
            if ($null -ne $claim.task) {
                Invoke-ClaimedTask -Claim $claim
                continue
            }
        } catch {
            Write-AgentLog "poll failed: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds ([int]$script:config.pollIntervalSeconds)
    }
} finally {
    Write-AgentLog "agent stopped"
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
