param(
    [string]$ConfigPath = "C:\ProgramData\MobileGateway\config\gateway-agent.json"
)

$ErrorActionPreference = "Stop"
$root = "C:\ProgramData\MobileGateway"
$logPath = Join-Path $root "logs\gateway-agent.log"
$statusPath = Join-Path $root "status.json"
$mutex = [Threading.Mutex]::new($false, "Global\MobileGatewayAgent")
$script:activeTasks = @{}
. (Join-Path $PSScriptRoot "gateway-device-selector.ps1")

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
        $devices = @($status.devices)
        foreach ($device in $devices) {
            $active = @(
                $script:activeTasks.Values |
                    Where-Object { $_.DeviceSerial -eq $device.serial }
            ) | Select-Object -First 1
            $device | Add-Member -NotePropertyName busy -NotePropertyValue ([bool]$active) -Force
            $device | Add-Member -NotePropertyName taskId -NotePropertyValue $(if ($active) { $active.Task.id } else { $null }) -Force
        }
        return @{
            statusFilePresent = $true
            adbHealthy = [bool]$status.adbHealthy
            appiumHealthy = [bool]$status.appiumHealthy
            devices = $devices
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

function Assert-DeviceReady {
    param(
        [Parameter(Mandatory)]
        [string]$DeviceSerial,
        [Parameter(Mandatory)]
        [string]$Platform
    )

    $adb = "C:\Program Files\Android\platform-tools\adb.exe"
    & $adb -s $DeviceSerial shell input keyevent 224 | Out-Null
    & $adb -s $DeviceSerial shell wm dismiss-keyguard | Out-Null
    & $adb -s $DeviceSerial shell input keyevent 82 | Out-Null
    Start-Sleep -Milliseconds 300
    $windowState = @(& $adb -s $DeviceSerial shell dumpsys window 2>$null)
    if ($windowState -match "mDreamingLockscreen=true") {
        throw "Device remains locked: $DeviceSerial"
    }

    $requiredPackages = @(
        "io.appium.uiautomator2.server",
        "io.appium.uiautomator2.server.test",
        "io.appium.settings"
    )
    $platformPackages = @{
        doubao = "com.larus.nova"
        deepseek = "com.deepseek.chat"
        yuanbao = "com.tencent.hunyuan.app.chat"
        qwen = "com.aliyun.tongyi"
        qianwen = "com.aliyun.tongyi"
        kimi = "com.moonshot.kimichat"
    }
    if ($platformPackages.ContainsKey($Platform)) {
        $requiredPackages += $platformPackages[$Platform]
    }
    foreach ($packageName in $requiredPackages) {
        $packagePath = @(& $adb -s $DeviceSerial shell pm path $packageName 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not ($packagePath -match "^package:")) {
            throw "Required package is missing on $($DeviceSerial): $packageName"
        }
    }
}

function Set-TaskDeviceSerial {
    param(
        [pscustomobject]$Task,
        [string[]]$BusySerials = @()
    )

    if ($Task.task_type -ne "appium.prompt") {
        return
    }

    $adb = "C:\Program Files\Android\platform-tools\adb.exe"
    $online = @(Get-AuthorizedDeviceSerials @(& $adb devices -l 2>$null))
    $configured = @($script:config.deviceSerials | Where-Object { $_ })
    $pool = if ($configured.Count -gt 0) { $configured } else { $online }
    $serial = $null
    $unavailable = @($BusySerials)
    $previous = $script:lastAssignedDeviceSerial
    $candidateCount = if ($Task.payload.device_serial) { 1 } else { $pool.Count }
    for ($attempt = 0; $attempt -lt $candidateCount; $attempt++) {
        $candidate = if ($Task.payload.device_serial) {
            [string]$Task.payload.device_serial
        } else {
            Select-NextDeviceSerial `
                -ConfiguredSerials $pool `
                -OnlineSerials $online `
                -PreviousSerial $previous `
                -BusySerials $unavailable
        }
        if (-not $candidate) {
            break
        }
        try {
            Assert-DeviceReady -DeviceSerial $candidate -Platform ([string]$Task.platform)
            $serial = $candidate
            break
        } catch {
            Write-AgentLog "device unavailable device=$candidate reason=$($_.Exception.Message)"
            $unavailable += $candidate
            $previous = $candidate
        }
    }
    if (-not $serial) {
        throw "No capture-ready Android device is currently available"
    }
    if ($serial -notin $online) {
        throw "Requested Android device is not authorized and online: $serial"
    }
    if ($serial -in $BusySerials) {
        throw "Requested Android device is busy: $serial"
    }

    $Task.payload | Add-Member -NotePropertyName device_serial -NotePropertyValue $serial -Force
    $ports = Get-DeviceAppiumPorts -ConfiguredSerials $pool -DeviceSerial $serial
    $Task.payload | Add-Member -NotePropertyName appium_system_port -NotePropertyValue $ports.systemPort -Force
    $Task.payload | Add-Member -NotePropertyName appium_mjpeg_server_port -NotePropertyValue $ports.mjpegServerPort -Force
    $script:lastAssignedDeviceSerial = $serial
    Write-AgentLog "assigned task=$($Task.id) device=$serial"
}

function Get-AppiumHandler {
    param([pscustomobject]$Task)

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
    $handler
}

function Start-AppiumTask {
    param(
        [pscustomobject]$Claim,
        [string[]]$BusySerials
    )

    $task = $Claim.task
    Set-TaskDeviceSerial -Task $task -BusySerials $BusySerials
    $handler = Get-AppiumHandler -Task $task
    $taskJson = $task | ConvertTo-Json -Depth 30 -Compress
    $verifier = Join-Path $PSScriptRoot "gateway-capture-verifier.ps1"
    $job = Start-Job -ScriptBlock {
        param([string]$HandlerPath, [string]$SerializedTask, [string]$VerifierPath, [string]$ShareReceiverSerial)
        $env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL = $ShareReceiverSerial
        . $VerifierPath
        Invoke-VerifiedCapture -HandlerPath $HandlerPath -SerializedTask $SerializedTask
    } -ArgumentList $handler, $taskJson, $verifier, ([string]$script:config.shareReceiverDeviceSerial)

    $script:activeTasks[$task.id] = [pscustomobject]@{
        Task = $task
        LeaseToken = $Claim.lease_token
        DeviceSerial = [string]$task.payload.device_serial
        Job = $job
        LastLeaseHeartbeat = Get-Date
    }
    Write-AgentLog "started task=$($task.id) device=$($task.payload.device_serial)"
}

function Start-BrowserTask {
    param([pscustomobject]$Claim)

    $task = $Claim.task
    if ($task.surface -ne "web") { throw "Browser task must target web surface" }
    $handler = Get-AppiumHandler -Task $task
    $taskJson = $task | ConvertTo-Json -Depth 30 -Compress
    $verifier = Join-Path $PSScriptRoot "gateway-capture-verifier.ps1"
    $browserRoot = [string]$script:config.browserRoot
    $nodePath = [string]$script:config.nodePath
    $job = Start-Job -ScriptBlock {
        param($HandlerPath, $SerializedTask, $VerifierPath, $BrowserRoot, $NodePath)
        $env:MOBILE_GATEWAY_BROWSER_ROOT = $BrowserRoot
        $env:MOBILE_GATEWAY_NODE_PATH = $NodePath
        . $VerifierPath
        Invoke-VerifiedCapture -HandlerPath $HandlerPath -SerializedTask $SerializedTask
    } -ArgumentList $handler, $taskJson, $verifier, $browserRoot, $nodePath
    $script:activeTasks[$task.id] = [pscustomobject]@{
        Task = $task
        LeaseToken = $Claim.lease_token
        DeviceSerial = $null
        Job = $job
        LastLeaseHeartbeat = Get-Date
    }
    Write-AgentLog "started browser task=$($task.id)"
}

function Convert-HandlerOutput {
    param([object[]]$Output)

    if ($Output.Count -ne 1) {
        return @{ output = $Output }
    }
    $singleOutput = $Output[0]
    if ($singleOutput -is [string]) {
        try {
            $singleOutput = $singleOutput | ConvertFrom-Json
        } catch {
            return @{ output = $singleOutput }
        }
    }
    if ($null -eq $singleOutput) {
        return @{}
    }
    $cleanResult = [ordered]@{}
    foreach ($property in $singleOutput.PSObject.Properties) {
        if ($property.Name -notin @("PSComputerName", "RunspaceId", "PSShowComputerName")) {
            $cleanResult[$property.Name] = $property.Value
        }
    }
    $cleanResult
}

function Send-TaskFailure {
    param(
        [pscustomobject]$Task,
        [string]$LeaseToken,
        [string]$Message,
        [string]$Code = "gateway_execution_failed"
    )

    try {
        Invoke-GatewayApi -Method Post -Path "/api/device-gateway/tasks/$($Task.id)/fail" -Body @{
            lease_token = $LeaseToken
            error_code = $Code
            error_message = $Message
            retryable = $Code -ne "handler_not_installed"
            retry_after_seconds = 30
        } | Out-Null
    } catch {
        Write-AgentLog "failed to report task=$($Task.id): $($_.Exception.Message)"
    }
    Write-AgentLog "failed task=$($Task.id) code=$Code message=$Message"
}

function Complete-ActiveTask {
    param([string]$TaskId)

    $active = $script:activeTasks[$TaskId]
    $job = $active.Job
    $task = $active.Task
    try {
        $captureWarnings = @()
        $output = @(Receive-Job -Job $job -ErrorAction Stop -WarningVariable captureWarnings -WarningAction SilentlyContinue)
        foreach ($warning in $captureWarnings) {
            Write-AgentLog "capture task=$($task.id) $warning"
        }
        if ($job.State -ne "Completed") {
            $reason = $job.ChildJobs[0].JobStateInfo.Reason
            $message = if ($reason) { $reason.Message } else { "Handler failed with state $($job.State)" }
            throw $message
        }
        $result = Convert-HandlerOutput -Output $output
        . (Join-Path $PSScriptRoot "gateway-capture-verifier.ps1")
        $quality = Test-CaptureResult -Result ([pscustomobject]$result)
        Write-AgentLog "quality task=$($task.id) passed=$($quality.Passed) references=$($quality.ReferenceCount) valid_sources=$($quality.ValidSourceCount) completeness=$([math]::Round($quality.Completeness, 4))"
        Invoke-GatewayApi -Method Post -Path "/api/device-gateway/tasks/$($task.id)/complete" -Body @{
            lease_token = $active.LeaseToken
            result = $result
        } | Out-Null
        Write-AgentLog "completed task=$($task.id) device=$($active.DeviceSerial)"
    } catch {
        Send-TaskFailure -Task $task -LeaseToken $active.LeaseToken -Message $_.Exception.Message
    } finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        $script:activeTasks.Remove($TaskId) | Out-Null
    }
}

function Update-ActiveTasks {
    foreach ($taskId in @($script:activeTasks.Keys)) {
        $active = $script:activeTasks[$taskId]
        if ($active.Job.State -in @("NotStarted", "Running")) {
            if (((Get-Date) - $active.LastLeaseHeartbeat).TotalSeconds -ge 30) {
                try {
                    Invoke-GatewayApi -Method Post -Path "/api/device-gateway/tasks/$taskId/heartbeat" -Body @{
                        lease_token = $active.LeaseToken
                    } | Out-Null
                    $active.LastLeaseHeartbeat = Get-Date
                } catch {
                    Write-AgentLog "heartbeat failed task=$($taskId): $($_.Exception.Message)"
                }
            }
            continue
        }
        Complete-ActiveTask -TaskId $taskId
    }
}

function Invoke-HealthTask {
    param([pscustomobject]$Claim)

    $task = $Claim.task
    try {
        $result = @{
            gatewayId = $script:config.gatewayId
            completedAt = (Get-Date).ToString("o")
            status = Get-DeviceSnapshot
            echo = $task.payload
        }
        Invoke-GatewayApi -Method Post -Path "/api/device-gateway/tasks/$($task.id)/complete" -Body @{
            lease_token = $Claim.lease_token
            result = $result
        } | Out-Null
        Write-AgentLog "completed task=$($task.id) type=$($task.task_type)"
    } catch {
        Send-TaskFailure -Task $task -LeaseToken $Claim.lease_token -Message $_.Exception.Message
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
    $script:lastAssignedDeviceSerial = $null
    $maxConcurrentTasks = Get-GatewayConcurrencyLimit `
        -ConfiguredSerials @($script:config.deviceSerials) `
        -ConfiguredMaximum ([int]$script:config.maxConcurrentTasks)
    Write-AgentLog "agent started gateway=$($script:config.gatewayId)"
    while ($true) {
        try {
            Update-ActiveTasks
            if (((Get-Date) - $script:lastHeartbeat).TotalSeconds -ge 30) {
                Send-Heartbeat
            }

            $busySerials = @($script:activeTasks.Values | ForEach-Object { $_.DeviceSerial } | Where-Object { $_ })
            $activeAppCount = @($script:activeTasks.Values | Where-Object { $_.Task.task_type -eq "appium.prompt" }).Count
            $activeBrowserCount = @($script:activeTasks.Values | Where-Object { $_.Task.task_type -eq "browser.prompt" }).Count
            $adb = "C:\Program Files\Android\platform-tools\adb.exe"
            $online = @(Get-AuthorizedDeviceSerials @(& $adb devices -l 2>$null))
            $configured = @($script:config.deviceSerials | Where-Object { $_ })
            $pool = if ($configured.Count -gt 0) { $configured } else { $online }
            $idleDeviceCount = @(
                Get-IdleDeviceSerials `
                    -ConfiguredSerials $pool `
                    -OnlineSerials $online `
                    -BusySerials $busySerials
            ).Count

            $claimCapabilities = @("gateway.healthcheck")
            if ($activeAppCount -lt $maxConcurrentTasks -and $idleDeviceCount -gt 0) {
                $claimCapabilities += "appium.prompt"
            }
            if ($script:config.browserRoot -and $activeBrowserCount -lt 1) {
                $claimCapabilities += "browser.prompt"
            }
            $claimCapabilities = @($claimCapabilities | Where-Object { $_ -in $script:config.capabilities })
            if ($claimCapabilities.Count -gt 0) {
                $claim = Invoke-GatewayApi `
                    -Method Post `
                    -Path "/api/device-gateway/tasks/claim" `
                    -Body @{ capabilities = $claimCapabilities }
                if ($null -ne $claim.task) {
                    if ($claim.task.task_type -eq "appium.prompt") {
                        try {
                            Start-AppiumTask -Claim $claim -BusySerials $busySerials
                        } catch {
                            $code = if ($_.FullyQualifiedErrorId -like "handler_not_installed*") {
                                "handler_not_installed"
                            } else {
                                "gateway_execution_failed"
                            }
                            Send-TaskFailure -Task $claim.task -LeaseToken $claim.lease_token -Message $_.Exception.Message -Code $code
                        }
                    } elseif ($claim.task.task_type -eq "browser.prompt") {
                        try {
                            Start-BrowserTask -Claim $claim
                        } catch {
                            Send-TaskFailure -Task $claim.task -LeaseToken $claim.lease_token -Message $_.Exception.Message
                        }
                    } elseif ($claim.task.task_type -eq "gateway.healthcheck") {
                        Invoke-HealthTask -Claim $claim
                    } else {
                        Send-TaskFailure -Task $claim.task -LeaseToken $claim.lease_token -Message "Unsupported task type: $($claim.task.task_type)"
                    }
                    continue
                }
            }
        } catch {
            Write-AgentLog "poll failed: $($_.Exception.Message)"
        }
        $sleepSeconds = if ($script:activeTasks.Count -gt 0) {
            1
        } else {
            [int]$script:config.pollIntervalSeconds
        }
        Start-Sleep -Seconds $sleepSeconds
    }
} finally {
    foreach ($active in @($script:activeTasks.Values)) {
        Stop-Job -Job $active.Job -ErrorAction SilentlyContinue
        Remove-Job -Job $active.Job -Force -ErrorAction SilentlyContinue
    }
    Write-AgentLog "agent stopped"
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
