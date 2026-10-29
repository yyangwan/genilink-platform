function Invoke-CaptureDeviceCommand {
    param([string[]]$Arguments, [int]$TimeoutSeconds = 5)
    $adb = 'C:\Program Files\Android\platform-tools\adb.exe'
    if (-not (Test-Path -LiteralPath $adb)) { return $false }
    if (@($Arguments | Where-Object { $_ -match '["\r\n]' }).Count) { return $false }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = [Diagnostics.ProcessStartInfo]::new()
    $process.StartInfo.FileName = $adb
    $process.StartInfo.Arguments = (@($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try {
        if (-not $process.Start()) { return $false }
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit([math]::Max(1, $TimeoutSeconds) * 1000)) {
            $process.Kill()
            $null = $process.WaitForExit(1000)
            return $false
        }
        return $process.ExitCode -eq 0
    } catch { return $false } finally { $process.Dispose() }
}

function Remember-CaptureSource {
    param([hashtable]$State, [object]$Record)
    if (-not $State -or -not $Record.url -or $Record.url_resolution -ne 'exact') { return }
    if (-not $State.ContainsKey('CapturedSources')) { $State.CapturedSources = @{} }
    $copy = @{}
    foreach ($name in @('index','kind','title','snippet','site_name','domain','url','raw_url','url_resolution','status','page_title','error_message')) {
        $copy[$name] = $Record.$name
    }
    $State.CapturedSources[[string]$Record.index] = $copy
}

function Save-CapturePopupEvidence {
    param([string]$Source, [string]$Reason, [string]$DeviceSerial,
        [string]$TaskKey, [string]$ResultRoot, [hashtable]$State = @{})
    if (-not $ResultRoot) { return }
    $key = $TaskKey -replace '[^a-zA-Z0-9_-]', '_'
    if (-not $key) { $key = 'unassigned' }
    $directory = Join-Path (Join-Path $ResultRoot $key) 'interruptions'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $id = [guid]::NewGuid().ToString('N')
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Source))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    $allowed = @('protected_dialog', 'unknown_dialog', 'upgrade_without_safe_action',
        'retry_exhausted', 'resume_mismatch', 'refresh_failed', 'unreadable_hierarchy')
    if ($Reason -notin $allowed) { $Reason = 'unknown_dialog' }
    $record = @{ reason = $Reason; ui_hash = $fingerprint; screenshot = $false;
        observed_at = [datetime]::UtcNow.ToString('o') }
    $canScreenshot = $Reason -notin @('protected_dialog', 'unreadable_hierarchy', 'refresh_failed')
    if ($canScreenshot) {
        $reader = $null
        try {
            $settings = [Xml.XmlReaderSettings]::new()
            $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
            $settings.XmlResolver = $null
            $settings.MaxCharactersInDocument = 8388608
            $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($Source), $settings)
            $document = [xml]::new(); $document.XmlResolver = $null
            $document.Load($reader)
            if ($document.SelectSingleNode("//*[@password='true' or @class='android.widget.EditText']")) { $canScreenshot = $false }
        } catch { $canScreenshot = $false } finally { if ($reader) { $reader.Dispose() } }
    }
    if ($canScreenshot -and $DeviceSerial) {
        $devicePath = "/sdcard/mobile-gateway-popup-$id.png"
        $imagePath = Join-Path $directory "$id.png"
        try {
            if (Invoke-CaptureDeviceCommand -Arguments @('-s',$DeviceSerial,'shell','screencap','-p',$devicePath)) {
                $pulled = Invoke-CaptureDeviceCommand -Arguments @('-s',$DeviceSerial,'pull',$devicePath,$imagePath)
                $record.screenshot = $pulled -and (Test-Path -LiteralPath $imagePath)
            }
        } catch {} finally {
            $null = Invoke-CaptureDeviceCommand -Arguments @('-s',$DeviceSerial,'shell','rm','-f',$devicePath)
        }
    }
    [IO.File]::WriteAllText((Join-Path $directory "$id.json"),
        ($record | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    if ($State.CapturedAnswer -or $State.CapturedSources.Count -gt 0) {
        $savedSources = @()
        if ($State.CapturedSources) { $savedSources = @($State.CapturedSources.Values | Sort-Object { [int]$_.index }) }
        $partial = @{status='interrupted'; answer=$State.CapturedAnswer; answer_status=$State.CapturedAnswerStatus;
            reference_count=$State.ReferenceCount; sources=$savedSources;
            reason=$Reason; task_id=$TaskKey}
        [IO.File]::WriteAllText((Join-Path $directory "$id-partial.json"),
            ($partial | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    }
}

function Invoke-CaptureSourceGuard {
    param([Parameter(Mandatory)][scriptblock]$ReadSource,
        [string]$ExpectedPackage, [string]$DeviceSerial,
        [string]$TaskKey, [string]$TaskPrompt, [string]$ResultRoot,
        [hashtable]$State = @{})
    $source = if ($State.ContainsKey('CapturePopupBlocked')) { '' } else { & $ReadSource }
    Resolve-CaptureInterruptions -Source $source -ExpectedPackage $ExpectedPackage -State $State `
        -Refresh $ReadSource -Tap {
            param($X, $Y)
            if (-not $DeviceSerial) { throw 'Popup dismissal requires an Android device' }
            if (-not (Invoke-CaptureDeviceCommand -Arguments @('-s',$DeviceSerial,'shell','input','tap',[string]$X,[string]$Y))) {
                throw 'Popup dismissal tap failed'
            }
            Start-Sleep -Milliseconds 500
        } -ResumeCheck {
            param($Before, $After)
            $beforeDocument = [xml]::new(); $beforeDocument.XmlResolver = $null
            $afterDocument = [xml]::new(); $afterDocument.XmlResolver = $null
            $beforeDocument.LoadXml($Before); $afterDocument.LoadXml($After)
            $packages = @($afterDocument.SelectNodes('//*[@package]') | ForEach-Object { $_.GetAttribute('package') })
            if ($ExpectedPackage -notin $packages) { return $false }
            if ($TaskPrompt) {
                $beforeText = @($beforeDocument.SelectNodes('//*[@text]') | ForEach-Object { $_.GetAttribute('text') })
                $afterText = @($afterDocument.SelectNodes('//*[@text]') | ForEach-Object { $_.GetAttribute('text') })
                if ($TaskPrompt -in $beforeText -and $TaskPrompt -notin $afterText) { return $false }
            }
            return $true
        } -OnBlocked {
            param($BlockedSource, $Reason)
            Save-CapturePopupEvidence -Source $BlockedSource -Reason $Reason `
                -DeviceSerial $DeviceSerial -TaskKey $TaskKey -ResultRoot $ResultRoot -State $State
        }
}
