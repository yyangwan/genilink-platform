function Invoke-InteractiveBrowserCapture {
    param(
        [Parameter(Mandatory)][string]$NodePath,
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string]$TaskPath,
        [Parameter(Mandatory)][string]$ResultPath,
        [Parameter(Mandatory)][string]$ProfilePath,
        [Parameter(Mandatory)][string]$UserId,
        [int]$TimeoutSeconds = 780
    )
    $name = 'MobileGateway-Qwen-' + [guid]::NewGuid().ToString('N')
    $registered = $false
    $started = Get-Date
    $observedRun = $false
    $arguments = @($ScriptPath, $TaskPath, $ResultPath, $ProfilePath, 'headed') | ForEach-Object {
        if ($_.Contains('"')) { throw 'Browser worker paths cannot contain quotes' }
        '"' + $_ + '"'
    }
    try {
        $action = New-ScheduledTaskAction -Execute $NodePath -Argument ($arguments -join ' ')
        # Interactive logon reuses the account that owns the Chrome login;
        # the SYSTEM agent must not reopen that profile under another identity.
        $principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([timespan]::FromSeconds($TimeoutSeconds)) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings -ErrorAction Stop | Out-Null
        $registered = $true
        Start-ScheduledTask -TaskName $name -ErrorAction Stop
        while ($true) {
            $task = Get-ScheduledTask -TaskName $name -ErrorAction Stop
            $info = Get-ScheduledTaskInfo -TaskName $name -ErrorAction Stop
            if ($task.State -eq 'Running' -or $info.LastRunTime -ge $started.AddSeconds(-2)) {
                $observedRun = $true
            }
            if ($observedRun -and $task.State -ne 'Running') {
                return [pscustomobject]@{ ExitCode = [long]$info.LastTaskResult; Output = @() }
            }
            $elapsed = ((Get-Date) - $started).TotalSeconds
            if (-not $observedRun -and $elapsed -ge 30) {
                throw 'QWEN_INTERACTIVE_SESSION_REQUIRED: browser login user must be signed into Windows'
            }
            if ($elapsed -ge $TimeoutSeconds) { throw 'QWEN_WORKER_TIMEOUT: interactive browser capture exceeded its deadline' }
            Start-Sleep -Milliseconds 500
        }
    } finally {
        if ($registered) {
            $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            if ($task.State -eq 'Running') {
                Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            }
            Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
        }
    }
}
