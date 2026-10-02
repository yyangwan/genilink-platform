param(
    [Parameter(Mandatory)]
    [string]$TaskJson,
    [Parameter(Mandatory)]
    [ValidateSet("deepseek", "yuanbao", "qwen", "kimi")]
    [string]$Platform
)

$ErrorActionPreference = "Stop"
$appiumBaseUrl = "http://127.0.0.1:4723"
$elementKey = "element-6066-11e4-a52e-4f735466cecf"
$resultRoot = "C:\ProgramData\MobileGateway\results"
$platformConfig = @{
    deepseek = @{
        package = "com.deepseek.chat"
        version = "2.2.2"
    }
    yuanbao = @{
        package = "com.tencent.hunyuan.app.chat"
        version = "2.78.0"
    }
    qwen = @{
        package = "com.aliyun.tongyi"
        version = "6.14.6.2959"
    }
    kimi = @{
        package = "com.moonshot.kimichat"
        version = "3.1.2"
    }
}
$packageName = [string]$platformConfig[$Platform].package
$task = $TaskJson | ConvertFrom-Json
$mutexSerial = ([string]$task.payload.device_serial) -replace "[^a-zA-Z0-9_-]", "_"
if (-not $mutexSerial) {
    $mutexSerial = "unassigned"
}
$mutex = [Threading.Mutex]::new(
    $false,
    "Global\MobileGateway-Android-Device-$mutexSerial"
)

if (-not $mutex.WaitOne(0)) {
    throw "Another Android device task is already running"
}

function Write-GatewayTrace {
    param([Parameter(Mandatory)][string]$Message)

    if ($script:tracePath) {
        Add-Content -LiteralPath $script:tracePath `
            -Value "$(Get-Date -Format o) $Message" `
            -Encoding UTF8
    }
}

function Start-DeepSeekApp {
    param([Parameter(Mandatory)][string]$Serial)

    # adb's monkey command writes normal diagnostics to stderr, which
    # PowerShell promotes to a terminating error under ErrorActionPreference.
    & cmd.exe /d /c "adb -s $Serial shell am start -W -S -n com.deepseek.chat/.MainActivity >nul 2>&1"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not start DeepSeek app (adb exit code $LASTEXITCODE)"
    }
    Start-Sleep -Milliseconds 700
    $resumedPackage = $null
    foreach ($line in @(& adb -s $Serial shell dumpsys activity activities)) {
        if ($line -match 'mResumedActivity:.*\s([a-zA-Z0-9._]+)/') {
            $resumedPackage = [string]$Matches[1]
            break
        }
    }
    if ($resumedPackage -ne 'com.deepseek.chat') {
        throw "DeepSeek did not reach the foreground (resumed=$resumedPackage)"
    }
}

function Resume-DeepSeekApp {
    param([Parameter(Mandatory)][string]$Serial)

    & cmd.exe /d /c "adb -s $Serial shell am start -W -n com.deepseek.chat/.MainActivity >nul 2>&1"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resume DeepSeek app (adb exit code $LASTEXITCODE)"
    }
    Start-Sleep -Milliseconds 700
    $resumedPackage = $null
    foreach ($line in @(& adb -s $Serial shell dumpsys activity activities)) {
        if ($line -match 'mResumedActivity:.*\s([a-zA-Z0-9._]+)/') {
            $resumedPackage = [string]$Matches[1]
            break
        }
    }
    if ($resumedPackage -ne 'com.deepseek.chat') {
        throw "DeepSeek did not return to the foreground (resumed=$resumedPackage)"
    }
}

function Invoke-AppiumRequest {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body,
        [int]$TimeoutSeconds = 30
    )

    $request = @{
        Method = $Method
        Uri = $appiumBaseUrl + $Path
        TimeoutSec = $TimeoutSeconds
    }
    if ($null -ne $Body) {
        $request.ContentType = "application/json; charset=utf-8"
        $request.Body = $Body | ConvertTo-Json -Depth 30 -Compress
    }
    Invoke-RestMethod @request
}

function New-AppiumSession {
    param(
        [Parameter(Mandatory)][string]$Serial,
        [Parameter(Mandatory)][int]$SystemPort,
        [Parameter(Mandatory)][int]$MjpegServerPort,
        [int]$CommandTimeoutSeconds = 420
    )

    $session = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session" `
        -Body @{
            capabilities = @{
                alwaysMatch = @{
                    platformName = "Android"
                    "appium:automationName" = "UiAutomator2"
                    "appium:deviceName" = $Serial
                    "appium:udid" = $Serial
                    "appium:noReset" = $true
                    "appium:newCommandTimeout" = $CommandTimeoutSeconds
                    "appium:skipDeviceInitialization" = $true
                    "appium:skipServerInstallation" = $true
                    "appium:systemPort" = $SystemPort
                    "appium:mjpegServerPort" = $MjpegServerPort
                }
                firstMatch = @(@{})
            }
        } `
        -TimeoutSeconds 60
    $sessionId = [string]$session.value.sessionId
    if (-not $sessionId) {
        throw "Appium did not return a session ID"
    }
    $sessionId
}

function Copy-AdbFile {
    param(
        [Parameter(Mandatory)][string]$DevicePath,
        [Parameter(Mandatory)][string]$LocalPath,
        [int]$TimeoutSeconds = 15
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "adb"
    $startInfo.Arguments = "-s $script:deviceSerial exec-out cat $DevicePath"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $stream = $null
    try {
        if (-not $process.Start()) {
            throw "Could not start adb file transfer"
        }
        $errorTask = $process.StandardError.ReadToEndAsync()
        $stream = [IO.File]::Create($LocalPath)
        $process.StandardOutput.BaseStream.CopyTo($stream)
        $stream.Dispose()
        $stream = $null
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill()
            throw "ADB file transfer timed out"
        }
        if ($process.ExitCode -ne 0) {
            throw "ADB file transfer failed: $($errorTask.Result.Trim())"
        }
    } finally {
        if ($stream) {
            $stream.Dispose()
        }
        $process.Dispose()
    }
}

function Find-Element {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Using,
        [Parameter(Mandatory)][string]$Value,
        [int]$TimeoutSeconds = 10,
        [switch]$Optional
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-AppiumRequest `
                -Method Post `
                -Path "/session/$SessionId/element" `
                -Body @{ using = $Using; value = $Value }
            $elementId = $response.value.$elementKey
            if ($elementId) {
                return $elementId
            }
        } catch {
            if ((Get-Date) -ge $deadline -and -not $Optional) {
                throw
            }
        }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)
    if ($Optional) {
        return $null
    }
    throw "Element not found using $Using`: $Value"
}

function Find-Elements {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Using,
        [Parameter(Mandatory)][string]$Value
    )

    try {
        $response = Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$SessionId/elements" `
            -Body @{ using = $Using; value = $Value }
        @(
            $response.value |
                ForEach-Object { $_.$elementKey } |
                Where-Object { $_ }
        )
    } catch {
        @()
    }
}

function Click-Element {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$ElementId
    )

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/element/$ElementId/click" `
        -Body @{} | Out-Null
}

function Click-Point {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$X,
        [Parameter(Mandatory)][int]$Y
    )

    if ($SessionId -eq "adb") {
        & adb -s $script:deviceSerial shell input tap $X $Y | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap ($X, $Y)"
        }
        return
    }
    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/execute/sync" `
        -Body @{
            script = "mobile: clickGesture"
            args = @(@{ x = $X; y = $Y })
        } | Out-Null
}

function Tap-Point {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$X,
        [Parameter(Mandatory)][int]$Y
    )

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/actions" `
        -Body @{
            actions = @(@{
                type = "pointer"
                id = "finger"
                parameters = @{ pointerType = "touch" }
                actions = @(
                    @{ type = "pointerMove"; duration = 0; x = $X; y = $Y; origin = "viewport" }
                    @{ type = "pointerDown"; button = 0 }
                    @{ type = "pause"; duration = 100 }
                    @{ type = "pointerUp"; button = 0 }
                )
            })
        } | Out-Null
}

function Scroll-Region {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [int]$Left = 0,
        [int]$Top = 400,
        [int]$Width = 1152,
        [int]$Height = 1850
    )

    if ($SessionId -eq "adb") {
        $centerX = [int]($Left + ($Width / 2))
        $startY = [int]($Top + ($Height * 0.82))
        $endY = [int]($Top + ($Height * 0.18))
        & adb -s $script:deviceSerial shell input swipe `
            $centerX $startY $centerX $endY 350 | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    $response = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/execute/sync" `
        -Body @{
            script = "mobile: scrollGesture"
            args = @(@{
                left = $Left
                top = $Top
                width = $Width
                height = $Height
                direction = "down"
                percent = 0.82
            })
        }
    [bool]$response.value
}

function Press-Back {
    param([Parameter(Mandatory)][string]$SessionId)

    if ($script:deviceSerial) {
        & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to send the Android back key"
        }
        return
    }
    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/back" `
        -Body @{} | Out-Null
}

function Get-PageSource {
    param([Parameter(Mandatory)][string]$SessionId)

    if ($script:deviceSerial) {
        # Appium's source endpoint can wedge on Compose-backed answer views.
        # Android's native dumper returns the same accessibility hierarchy
        # without leaving a request blocked in UiAutomator2.
        $name = "$Platform-$PID-$([guid]::NewGuid().ToString('N')).xml"
        $devicePath = "/sdcard/$name"
        $localPath = Join-Path $env:TEMP $name
        try {
            Write-GatewayTrace "ui_dump start"
            $dumpExitCode = 1
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                $savedPreference = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                try {
                    & adb -s $script:deviceSerial shell timeout 15 `
                        uiautomator dump $devicePath 2>&1 | Out-Null
                    $dumpExitCode = $LASTEXITCODE
                } finally {
                    $ErrorActionPreference = $savedPreference
                }
                if ($dumpExitCode -eq 0) {
                    break
                }
                Start-Sleep -Seconds 1
            }
            if ($dumpExitCode -ne 0) {
                throw "Android UI hierarchy dump failed"
            }
            Copy-AdbFile -DevicePath $devicePath -LocalPath $localPath
            Write-GatewayTrace "ui_dump complete"
            return [IO.File]::ReadAllText($localPath, [Text.Encoding]::UTF8)
        } finally {
            Remove-Item -LiteralPath $localPath -Force -ErrorAction SilentlyContinue
            & adb -s $script:deviceSerial shell rm -f $devicePath | Out-Null
        }
    }
    [string](Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$SessionId/source" `
        -Body $null `
        -TimeoutSeconds 45).value
}

function Ensure-AndroidDeviceUnlocked {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        & adb -s $script:deviceSerial shell input keyevent KEYCODE_WAKEUP | Out-Null
        & adb -s $script:deviceSerial shell input keyevent 82 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not wake Android device $script:deviceSerial"
        }
        Start-Sleep -Milliseconds 700
        $source = Get-PageSource -SessionId $SessionId
        if ($source -notmatch 'com\.android\.systemui:id/keyguard_lock_screen_panel') {
            return
        }
        & adb -s $script:deviceSerial shell input swipe 540 1900 540 500 300 |
            Out-Null
        Start-Sleep -Milliseconds 500
    }
    throw (
        "Android device $script:deviceSerial is locked; configure it for " +
        "unattended swipe-to-unlock access"
    )
}

function Get-ClipboardText {
    param([Parameter(Mandatory)][string]$SessionId)

    if ($Platform -in @("deepseek", "yuanbao", "kimi") -and $script:deviceSerial) {
        if ($Platform -eq "deepseek") {
            # Appium session cleanup leaves the Settings helper stopped, so
            # its explicit clipboard receiver otherwise returns result=0.
            & adb -s $script:deviceSerial shell am start -n `
                io.appium.settings/.Settings | Out-Null
            Start-Sleep -Milliseconds 400
        }
        $previousIme = ([string](
            & adb -s $script:deviceSerial shell settings get secure default_input_method
        )).Trim()
        try {
            & adb -s $script:deviceSerial shell ime set io.appium.settings/.AppiumIME | Out-Null
            Start-Sleep -Milliseconds 500
            $output = & adb -s $script:deviceSerial shell am broadcast `
                -n io.appium.settings/.receivers.ClipboardReceiver `
                -a io.appium.settings.clipboard.get 2>&1 | Out-String
            if ($output -notmatch 'data="([A-Za-z0-9+/=]+)"') {
                throw "Appium Settings did not return clipboard content"
            }
            $text = [Text.Encoding]::UTF8.GetString(
                [Convert]::FromBase64String($Matches[1])
            ).Trim()
            if ($text -notmatch '^https?://' -and $text -match '^([A-Za-z0-9+/]{20,}={0,2})') {
                try {
                    $nested = [Text.Encoding]::UTF8.GetString(
                        [Convert]::FromBase64String($Matches[1])
                    ).Trim()
                    if ($nested -match '^https?://') {
                        $text = $nested
                    }
                } catch {}
            }
            return $text
        } finally {
            if ($previousIme -and $previousIme -ne "null") {
                & adb -s $script:deviceSerial shell ime set $previousIme | Out-Null
            }
            if ($Platform -eq "deepseek") {
                Resume-DeepSeekApp -Serial $script:deviceSerial
            }
        }
    }
    $response = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/execute/sync" `
        -Body @{
            script = "mobile: getClipboard"
            args = @(@{})
        }
    if (-not $response.value) {
        return $null
    }
    try {
        [Text.Encoding]::UTF8.GetString(
            [Convert]::FromBase64String([string]$response.value)
        ).Trim()
    } catch {
        throw "Appium returned invalid clipboard content"
    }
}

function Set-ClipboardText {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Text
    )

    $clipboardSessionId = $SessionId
    $ownsSession = $false
    if ($SessionId -eq "adb") {
        $clipboardSessionId = New-AppiumSession `
            -Serial $script:deviceSerial `
            -SystemPort $script:systemPort `
            -MjpegServerPort $script:mjpegServerPort `
            -CommandTimeoutSeconds 60
        $ownsSession = $true
    }
    try {
        $content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Text))
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$clipboardSessionId/execute/sync" `
            -Body @{
                script = "mobile: setClipboard"
                args = @(@{
                    content = $content
                    contentType = "plaintext"
                    label = "mobile-gateway"
                })
            } | Out-Null
    } finally {
        if ($ownsSession -and $clipboardSessionId) {
            try {
                Invoke-AppiumRequest `
                    -Method Delete `
                    -Path "/session/$clipboardSessionId" `
                    -Body $null `
                    -TimeoutSeconds 15 | Out-Null
            } catch {
                Write-GatewayTrace (
                    "clipboard Appium session cleanup skipped: " +
                    $_.Exception.Message
                )
            }
        }
    }
}

function Get-DeepSeekAnswerSnapshot {
    param([Parameter(Mandatory)][string]$SessionId)

    $sizeOutput = (& adb -s $script:deviceSerial shell wm size 2>&1) -join "`n"
    $sizeMatches = [regex]::Matches($sizeOutput, '(\d+)x(\d+)')
    if ($sizeMatches.Count -lt 1) {
        throw "Could not determine the Android display size"
    }
    $activeSize = $sizeMatches[$sizeMatches.Count - 1]
    $width = [int]$activeSize.Groups[1].Value
    $height = [int]$activeSize.Groups[2].Value

    # The floating down arrow is the only reliable control while Compose is
    # rendering a long answer. At the bottom, the same point may open Retry.
    & adb -s $script:deviceSerial shell input tap `
        ([int]($width * 0.90)) ([int]($height * 0.83)) | Out-Null
    Start-Sleep -Milliseconds 800

    $source = Get-PageSource -SessionId $SessionId
    if ($source -match '更加简洁|更加详细|再试一次') {
        & adb -s $script:deviceSerial shell input tap `
            ([int]($width * 0.02)) ([int]($height * 0.45)) | Out-Null
        Start-Sleep -Milliseconds 300
        $source = Get-PageSource -SessionId $SessionId
    }
    $document = ConvertTo-Xml -Source $source
    $copyNode = $document.SelectSingleNode("//*[@content-desc='复制']")
    $copyBounds = if ($copyNode) { Get-Bounds -Node $copyNode } else { $null }
    if (-not $copyBounds) {
        return $null
    }

    & adb -s $script:deviceSerial shell input tap `
        $copyBounds.center_x $copyBounds.center_y | Out-Null
    Start-Sleep -Milliseconds 400
    $answer = Get-ClipboardText -SessionId $SessionId
    if (-not $answer -or $answer.Length -lt 30 -or $answer -match '^https?://') {
        return $null
    }

    $referenceCount = 0
    if ($source -match '(?:已阅读\s*)?(\d+)\s*个网页') {
        $referenceCount = [int]$Matches[1]
    }
    @{
        source = $source
        answer = $answer
        reference_count = $referenceCount
    }
}

function Get-YuanbaoAnswerSnapshot {
    param([Parameter(Mandatory)][string]$SessionId)

    $sizeOutput = (& adb -s $script:deviceSerial shell wm size 2>&1) -join "`n"
    $sizeMatches = [regex]::Matches($sizeOutput, '(\d+)x(\d+)')
    if ($sizeMatches.Count -lt 1) {
        throw "Could not determine the Android display size"
    }
    $activeSize = $sizeMatches[$sizeMatches.Count - 1]
    $width = [int]$activeSize.Groups[1].Value
    $height = [int]$activeSize.Groups[2].Value

    for ($attempt = 0; $attempt -lt 16; $attempt++) {
        $source = Get-PageSource -SessionId $SessionId
        $document = ConvertTo-Xml -Source $source
        $copyNode = $document.SelectSingleNode(
            "//*[@text='复制本次模型回答' or @content-desc='复制本次模型回答']"
        )
        $copyBounds = if ($copyNode) { Get-Bounds -Node $copyNode } else { $null }
        if ($copyBounds) {
            & adb -s $script:deviceSerial shell input tap `
                $copyBounds.center_x $copyBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 400
            $answer = Get-ClipboardText -SessionId $SessionId
            if ($answer -and $answer.Length -ge 30 -and $answer -notmatch '^https?://') {
                return @{
                    source = $source
                    answer = $answer
                    reference_count = 0
                }
            }
        }
        & adb -s $script:deviceSerial shell input swipe `
            ([int]($width * 0.78)) ([int]($height * 0.63)) `
            ([int]($width * 0.78)) ([int]($height * 0.19)) 250 | Out-Null
        Start-Sleep -Milliseconds 500
    }
    $null
}

function ConvertTo-Xml {
    param([Parameter(Mandatory)][string]$Source)

    try {
        [xml]$Source
    } catch {
        $null
    }
}

function Get-Bounds {
    param([Parameter(Mandatory)]$Node)

    $value = [string]$Node.GetAttribute("bounds")
    if ($value -match "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$") {
        if (
            [int]$Matches[3] -le [int]$Matches[1] -or
            [int]$Matches[4] -le [int]$Matches[2]
        ) {
            return $null
        }
        return @{
            left = [int]$Matches[1]
            top = [int]$Matches[2]
            right = [int]$Matches[3]
            bottom = [int]$Matches[4]
            center_x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
            center_y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
        }
    }
    $null
}

function Get-PromptInputBounds {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$TargetPlatform
    )

    $source = Get-PageSource -SessionId $SessionId
    $document = ConvertTo-Xml -Source $source
    if (-not $document) {
        return $null
    }
    $node = switch ($TargetPlatform) {
        "yuanbao" {
            $document.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/edConversationInput' or " +
                "@class='android.widget.EditText']"
            )
        }
        "qwen" {
            $document.SelectSingleNode(
                "//*[@class='android.widget.EditText' or " +
                "@text='发消息或按住说话...']"
            )
        }
        "kimi" {
            $document.SelectSingleNode("//*[@text='尽管问，带图也行']")
        }
    }
    if ($node) {
        Get-Bounds -Node $node
    }
}

function Get-SendButtonBounds {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$TargetPlatform
    )

    $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
    if (-not $document) {
        return $null
    }
    if ($TargetPlatform -eq "kimi") {
        $sendNode = $document.SelectSingleNode(
            "//*[@content-desc='发送讯息' or @content-desc='发送']"
        )
        if ($sendNode) {
            return Get-Bounds -Node $sendNode
        }
    }
    $candidate = @($document.SelectNodes("//*[@clickable='true']")) |
        ForEach-Object {
            $bounds = Get-Bounds -Node $_
            if (
                $bounds -and
                $bounds.left -gt 800 -and
                $bounds.top -gt 1800 -and
                ($bounds.right - $bounds.left) -le 180
            ) {
                [pscustomobject]@{ node = $_; bounds = $bounds }
            }
        } |
        Sort-Object { $_.bounds.left } -Descending |
        Select-Object -First 1
    if ($candidate) {
        $candidate.bounds
    }
}

function Enable-QwenResearchMode {
    param([Parameter(Mandatory)][string]$SessionId)

    $source = Get-PageSource -SessionId $SessionId
    $document = ConvertTo-Xml -Source $source
    if (-not $document) {
        throw "Could not inspect the Qwen response mode"
    }

    $selectedResearchNode = @(
        $document.SelectNodes("//*[@text='思考研究']") |
            Where-Object {
                $bounds = Get-Bounds -Node $_
                $bounds -and $bounds.top -ge 1750
            }
    ) | Select-Object -First 1
    if ($selectedResearchNode) {
        return
    }

    $quickNode = @(
        $document.SelectNodes("//*[@text='快速']") |
            Where-Object {
                $bounds = Get-Bounds -Node $_
                $bounds -and $bounds.top -ge 1750
            }
    ) | Select-Object -First 1
    $quickBounds = if ($quickNode) { Get-Bounds -Node $quickNode } else { $null }
    if (-not $quickBounds) {
        throw "Could not locate Qwen's response mode control"
    }
    & adb -s $script:deviceSerial shell input tap `
        $quickBounds.center_x $quickBounds.center_y | Out-Null
    Start-Sleep -Milliseconds 500

    $menuDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
    $researchNode = if ($menuDocument) {
        @($menuDocument.SelectNodes("//*[@text='思考研究']")) |
            Where-Object {
                $bounds = Get-Bounds -Node $_
                $bounds -and $bounds.top -ge 1200
            } |
            Select-Object -First 1
    } else {
        $null
    }
    $researchBounds = if ($researchNode) {
        Get-Bounds -Node $researchNode
    } else {
        $null
    }
    if (-not $researchBounds) {
        throw "Qwen did not expose the research mode option"
    }
    & adb -s $script:deviceSerial shell input tap `
        $researchBounds.center_x $researchBounds.center_y | Out-Null
    Start-Sleep -Milliseconds 700

    $verifiedDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
    $verified = if ($verifiedDocument) {
        @($verifiedDocument.SelectNodes("//*[@text='思考研究']")) |
            Where-Object {
                $bounds = Get-Bounds -Node $_
                $bounds -and $bounds.top -ge 1750
            } |
            Select-Object -First 1
    } else {
        $null
    }
    if (-not $verified) {
        throw "Qwen research mode was not selected"
    }
}

function Dismiss-HuaweiTouchProtection {
    param([Parameter(Mandatory)][string]$SessionId)

    $source = Get-PageSource -SessionId $SessionId
    if ($source -notmatch '防误触模式') {
        return
    }
    Write-GatewayTrace "Huawei touch protection detected"
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        & adb -s $script:deviceSerial shell input swipe `
            200 2020 880 2020 500 | Out-Null
        Start-Sleep -Milliseconds 500
    }
    if ((Get-PageSource -SessionId $SessionId) -match '防误触模式') {
        throw "Could not dismiss Huawei touch protection"
    }
    Write-GatewayTrace "Huawei touch protection dismissed"
}

function Get-DescendantTexts {
    param([Parameter(Mandatory)]$Node)

    @(
        $Node.SelectNodes(".//*[@text]") |
            ForEach-Object { $_.GetAttribute("text").Trim() } |
            Where-Object { $_ }
    )
}

function Get-AdbDevices {
    @(
        @(& adb devices -l) |
            Select-Object -Skip 1 |
            Where-Object { $_ -match "\sdevice(?:\s|$)" } |
            ForEach-Object { ($_ -split "\s+")[0] }
    )
}

function ConvertTo-NormalizedText {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return $null
    }
    $Value `
        -replace "[\u200B-\u200D\u2060\uFEFF]", "" `
        -replace [char]0x00A0, " "
}

function Get-UrlsFromText {
    param([AllowNull()][string]$Text)

    $normalized = ConvertTo-NormalizedText -Value $Text
    if (-not $normalized) {
        return @()
    }
    @(
        [regex]::Matches(
            $normalized,
            "https?://[^\s，。；;）)\]】>]+",
            [Text.RegularExpressions.RegexOptions]::IgnoreCase
        ) |
            ForEach-Object { $_.Value.TrimEnd(".", ",", "。", "，") } |
            Select-Object -Unique
    )
}

function ConvertTo-CanonicalUrl {
    param([Parameter(Mandatory)][string]$Url)

    try {
        $builder = [UriBuilder]::new($Url)
        $builder.Fragment = ""
        $builder.Uri.AbsoluteUri
    } catch {
        $Url
    }
}

function Get-Host {
    param([AllowNull()][string]$Url)

    if (-not $Url) {
        return $null
    }
    try {
        ([Uri]$Url).Host.ToLowerInvariant()
    } catch {
        $null
    }
}

function Get-ResolverUrl {
    $dump = @(& adb -s $script:deviceSerial shell dumpsys activity activities)
    $candidates = @()
    foreach ($line in $dump) {
        if ($line -match "dat=(https?://[^\s}]+)") {
            $candidates += [string]$Matches[1]
        }
    }
    if ($candidates.Count -gt 0) {
        $first = $candidates[0]
        try {
            $urlHost = ([Uri]$first).Host
            $completeSameHost = @(
                $candidates |
                    Where-Object {
                        $_ -notmatch '/\.\.\.(?:$|[/?#])' -and
                        ([Uri]$_).Host -eq $urlHost
                    }
            )
            if ($completeSameHost.Count -gt 0) {
                return [string](
                    $completeSameHost |
                        Sort-Object Length -Descending |
                        Select-Object -First 1
                )
            }
        } catch {}
        return $first
    }
    foreach ($line in $dump) {
        if ($line -match 'dat=zhihu://articles/(\d+)') {
            return "https://zhuanlan.zhihu.com/p/$($Matches[1])"
        }
        if ($line -match 'dat=zhihu://questions/(\d+)') {
            return "https://www.zhihu.com/question/$($Matches[1])"
        }
        if ($line -match 'dat=zhihu://answers/(\d+)') {
            return "https://www.zhihu.com/answer/$($Matches[1])"
        }
    }
    return $null
}

function Get-ExternalUrlHandlerPackage {
    $activityDump = @(
        & adb -s $script:deviceSerial shell dumpsys activity activities
    )
    foreach ($line in $activityDump) {
        if (
            $line -match '(?:mResumedActivity|ResumedActivity):.*\s([a-zA-Z0-9._]+)/' -and
            $Matches[1] -ne $packageName
        ) {
            return [string]$Matches[1]
        }
    }
    foreach ($line in $activityDump) {
        if (
            $line -match 'dat=https?://[^\s}]+.*cmp=([a-zA-Z0-9._]+)/' -and
            $Matches[1] -ne $packageName
        ) {
            return [string]$Matches[1]
        }
    }
    $null
}

function Get-AppVersion {
    param([Parameter(Mandatory)][string]$Package)

    foreach ($line in @(
        & adb -s $script:deviceSerial shell dumpsys package $Package
    )) {
        if ($line -match "versionName=(.+)$") {
            return $Matches[1].Trim()
        }
    }
    [string]$platformConfig[$Platform].version
}

function Start-NewConversation {
    param([Parameter(Mandatory)][string]$SessionId)

    $script:readyInputElement = $null
    switch ($Platform) {
        "deepseek" {
            # The Compose accessibility lookup can wedge before input. The
            # New Conversation button is fixed in the top-right on every
            # DeepSeek conversation/mode screen.
            & adb -s $script:deviceSerial shell input tap 1075 190 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "ADB failed to start a DeepSeek conversation"
            }
            Start-Sleep -Seconds 1
        }
        "yuanbao" {
            # Yuanbao can show its upgrade dialog on launch, and Huawei can
            # leave a system guide above the app after source navigation.
            # Clear known blockers from the hierarchy before using app coords.
            for ($dismissAttempt = 0; $dismissAttempt -lt 4; $dismissAttempt++) {
                $blockerSource = Get-PageSource -SessionId $SessionId
                if (
                    $blockerSource -match '欢迎使用\s*元宝' -or
                    $blockerSource -match '同意并继续'
                ) {
                    throw (
                        "Yuanbao is not initialized on device " +
                        "$script:deviceSerial; complete the privacy agreement " +
                        "and account setup manually"
                    )
                }
                $blockerDocument = ConvertTo-Xml -Source $blockerSource
                $blocker = if ($blockerDocument) {
                    $blockerDocument.SelectSingleNode(
                        "//*[@resource-id='$packageName`:id/skip' or " +
                        "@text='稍后提示' or @text='取消']"
                    )
                } else {
                    $null
                }
                $blockerBounds = if ($blocker) {
                    Get-Bounds -Node $blocker
                } else {
                    $null
                }
                if (-not $blockerBounds) {
                    break
                }
                & adb -s $script:deviceSerial shell input tap `
                    $blockerBounds.center_x $blockerBounds.center_y | Out-Null
                Start-Sleep -Milliseconds 700
            }
            # Always create an empty conversation through Yuanbao's drawer.
            $source = Get-PageSource -SessionId $SessionId
            $document = ConvertTo-Xml -Source $source
            $drawerNode = if ($document) {
                $document.SelectSingleNode("//*[@content-desc='抽屉页入口']")
            } else {
                $null
            }
            $drawerBounds = if ($drawerNode) {
                Get-Bounds -Node $drawerNode
            } else {
                $null
            }
            if (-not $drawerBounds) {
                throw "Could not locate the Yuanbao conversation drawer"
            }
            & adb -s $script:deviceSerial shell input tap `
                $drawerBounds.center_x $drawerBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 700
            $drawerSource = Get-PageSource -SessionId $SessionId
            $drawerDocument = ConvertTo-Xml -Source $drawerSource
            $newConversationNode = if ($drawerDocument) {
                $drawerDocument.SelectSingleNode("//*[@text='新建对话']")
            } else {
                $null
            }
            $newConversationBounds = if ($newConversationNode) {
                Get-Bounds -Node $newConversationNode
            } else {
                $null
            }
            if (-not $newConversationBounds) {
                throw "Could not locate Yuanbao's new conversation control"
            }
            & adb -s $script:deviceSerial shell input tap `
                $newConversationBounds.center_x `
                $newConversationBounds.center_y | Out-Null
            Start-Sleep -Seconds 1
            $conversationReady = $false
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                if (Get-PromptInputBounds `
                    -SessionId $SessionId `
                    -TargetPlatform $Platform) {
                    $script:readyInputElement = "adb"
                    $conversationReady = $true
                    break
                }
                Start-Sleep -Seconds 1
            }
            if (-not $conversationReady) {
                throw "Could not return Yuanbao to a conversation screen"
            }
        }
        "qwen" {
            $source = Get-PageSource -SessionId $SessionId
            $document = ConvertTo-Xml -Source $source
            $drawerNode = if ($document) {
                @($document.SelectNodes("//*[@clickable='true']")) |
                    Where-Object {
                        $bounds = Get-Bounds -Node $_
                        $bounds -and $bounds.left -lt 180 -and $bounds.top -lt 260
                    } |
                    Select-Object -First 1
            } else {
                $null
            }
            $drawerBounds = if ($drawerNode) {
                Get-Bounds -Node $drawerNode
            } else {
                $null
            }
            if (-not $drawerBounds) {
                throw "Could not locate the Qwen conversation drawer"
            }
            & adb -s $script:deviceSerial shell input tap `
                $drawerBounds.center_x $drawerBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 700
            $drawerDocument = ConvertTo-Xml -Source (
                Get-PageSource -SessionId $SessionId
            )
            $newConversationNode = if ($drawerDocument) {
                $drawerDocument.SelectSingleNode("//*[@text='新建对话']")
            } else {
                $null
            }
            $newConversationBounds = if ($newConversationNode) {
                Get-Bounds -Node $newConversationNode
            } else {
                $null
            }
            if (-not $newConversationBounds) {
                throw "Could not locate Qwen's new conversation control"
            }
            & adb -s $script:deviceSerial shell input tap `
                $newConversationBounds.center_x `
                $newConversationBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 700
            if (-not (Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform)) {
                $voiceDocument = ConvertTo-Xml -Source (
                    Get-PageSource -SessionId $SessionId
                )
                $keyboardNode = if ($voiceDocument) {
                    $voiceDocument.SelectSingleNode("//*[@content-desc='键盘按钮']")
                } else {
                    $null
                }
                $keyboardBounds = if ($keyboardNode) {
                    Get-Bounds -Node $keyboardNode
                } else {
                    $null
                }
                if (-not $keyboardBounds) {
                    throw "Could not locate the Qwen keyboard control"
                }
                & adb -s $script:deviceSerial shell input tap `
                    $keyboardBounds.center_x $keyboardBounds.center_y | Out-Null
                Start-Sleep -Milliseconds 700
            }
            if (-not (Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform)) {
                throw "Qwen did not reach a conversation input"
            }
            Enable-QwenResearchMode -SessionId $SessionId
        }
        "kimi" {
            $source = Get-PageSource -SessionId $SessionId
            $document = ConvertTo-Xml -Source $source
            $drawerNode = if ($document) {
                $document.SelectSingleNode("//*[@content-desc='导航按钮']")
            } else {
                $null
            }
            $drawerBounds = if ($drawerNode) {
                Get-Bounds -Node $drawerNode
            } else {
                $null
            }
            if (-not $drawerBounds) {
                throw "Could not locate the Kimi conversation drawer"
            }
            & adb -s $script:deviceSerial shell input tap `
                $drawerBounds.center_x $drawerBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 700
            $drawerDocument = ConvertTo-Xml -Source (
                Get-PageSource -SessionId $SessionId
            )
            $newConversationNode = if ($drawerDocument) {
                @($drawerDocument.SelectNodes(
                    "//*[@class='android.widget.Button' and @clickable='true']"
                )) |
                    Where-Object {
                        $bounds = Get-Bounds -Node $_
                        $bounds -and $bounds.left -gt 650 -and $bounds.top -lt 350
                    } |
                    Select-Object -First 1
            } else {
                $null
            }
            $newConversationBounds = if ($newConversationNode) {
                Get-Bounds -Node $newConversationNode
            } else {
                $null
            }
            if (-not $newConversationBounds) {
                throw "Could not locate Kimi's new conversation control"
            }
            & adb -s $script:deviceSerial shell input tap `
                $newConversationBounds.center_x `
                $newConversationBounds.center_y | Out-Null
            Start-Sleep -Seconds 1
            $source = Get-PageSource -SessionId $SessionId
            $document = ConvertTo-Xml -Source $source
            $dismissNode = if ($document) {
                $document.SelectSingleNode("//*[@text='稍后再说']")
            } else {
                $null
            }
            $dismissBounds = if ($dismissNode) {
                Get-Bounds -Node $dismissNode
            } else {
                $null
            }
            if ($dismissBounds) {
                & adb -s $script:deviceSerial shell input tap `
                    $dismissBounds.center_x $dismissBounds.center_y | Out-Null
                Start-Sleep -Milliseconds 700
            }
            if (-not (Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform)) {
                throw "Kimi did not reach a conversation input"
            }
        }
    }
    Start-Sleep -Seconds 2
}

function Submit-Prompt {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Prompt
    )

    switch ($Platform) {
        "deepseek" {
            # DeepSeek's Compose input can leave UiAutomator2 blocked forever
            # while resolving android.widget.EditText. Use ADB for the input
            # path so a stuck lookup cannot poison the next app session.
            & adb -s $script:deviceSerial shell input tap 550 2100 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "ADB failed to focus the DeepSeek prompt input"
            }
            Start-Sleep -Seconds 1
            # DeepSeek preserves an unsent draft across new conversations.
            # Move to the end and delete a bounded maximum prompt length in a
            # single adb invocation before typing the retry payload.
            $clearKeys = @("123") + @(1..300 | ForEach-Object { "67" })
            & adb -s $script:deviceSerial shell input keyevent @clearKeys | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "ADB failed to clear the DeepSeek prompt input"
            }
            Start-Sleep -Milliseconds 500
            $input = "adb"
        }
        "yuanbao" {
            $input = "adb"
        }
        { $_ -in @("qwen", "kimi") } {
            $input = "adb"
        }
    }

    # Compose-backed inputs can hang UiAutomator2 on clear. A newly created
    # conversation is already empty, so ADB-backed inputs do not need clearing.
    if ($input -ne "adb") {
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$SessionId/element/$input/clear" `
            -Body @{} | Out-Null
    }
    if ($input -eq "adb") {
        if ($Platform -in @("yuanbao", "qwen", "kimi")) {
            $inputBounds = Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform
            if (-not $inputBounds) {
                throw "Could not locate the $Platform prompt input"
            }
            & adb -s $script:deviceSerial shell input tap `
                $inputBounds.center_x $inputBounds.center_y | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "ADB failed to focus the $Platform prompt input"
            }
        }
        Start-Sleep -Milliseconds 500
        $qwenDraftConfirmed = $false
        if ($Platform -eq "qwen") {
            $focusedBounds = Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform
            if (-not $focusedBounds) {
                throw "Qwen did not expose its focused editor"
            }
            $inputBounds = $focusedBounds
            # Qwen persists drafts across new chats, so clear the focused
            # editor before pasting the next prompt.
            $clearKeys = @("123") + @(1..300 | ForEach-Object { "67" })
            & adb -s $script:deviceSerial shell input keyevent @clearKeys | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not clear the Qwen prompt input"
            }
            Start-Sleep -Milliseconds 300
        }
        Set-ClipboardText -SessionId $SessionId -Text $Prompt
        if ($Platform -in @("yuanbao", "qwen", "kimi")) {
            # Closing the short-lived clipboard session can move input focus.
            $refocusBounds = Get-PromptInputBounds `
                -SessionId $SessionId `
                -TargetPlatform $Platform
            if ($refocusBounds) {
                $inputBounds = $refocusBounds
            }
            & adb -s $script:deviceSerial shell input tap `
                $inputBounds.center_x $inputBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 300
        }
        & adb -s $script:deviceSerial shell input keyevent 279 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not paste the $Platform prompt"
        }
        Start-Sleep -Milliseconds 500
        if ($Platform -eq "qwen") {
            $draftSource = Get-PageSource -SessionId $SessionId
            $qwenDraftConfirmed = (
                $draftSource -match [regex]::Escape($Prompt)
            )
            if (-not $qwenDraftConfirmed) {
                throw "qwen prompt input was not confirmed in the focused editor"
            }
        }
        if ($Platform -in @("yuanbao", "kimi")) {
            $draftSource = Get-PageSource -SessionId $SessionId
            if ($draftSource -notmatch [regex]::Escape($Prompt)) {
                throw "$Platform prompt input was not confirmed in the UI"
            }
        }
        if ($Platform -in @("yuanbao", "qwen", "kimi")) {
            & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
            Start-Sleep -Milliseconds 500
        }
    } else {
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$SessionId/element/$input/value" `
            -Body @{ text = $Prompt; value = @($Prompt) } | Out-Null
    }
    Start-Sleep -Seconds 1

    if ($Platform -eq "yuanbao") {
        # Restore the full-height layout before locating the send control.
        & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
        Start-Sleep -Milliseconds 500
    }
    if ($Platform -eq "deepseek") {
        $sizeOutput = (
            & adb -s $script:deviceSerial shell wm size 2>&1
        ) -join "`n"
        $sizeMatches = [regex]::Matches($sizeOutput, '(\d+)x(\d+)')
        if ($sizeMatches.Count -lt 1) {
            throw "Could not determine the Android display size"
        }
        $activeSize = $sizeMatches[$sizeMatches.Count - 1]
        $width = [int]$activeSize.Groups[1].Value
        $height = [int]$activeSize.Groups[2].Value
        & adb -s $script:deviceSerial shell input tap `
            ([int]($width * 0.89)) ([int]($height * 0.60)) | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap the DeepSeek send button"
        }
        return
    }
    if ($Platform -eq "yuanbao") {
        $sizeOutput = (& adb -s $script:deviceSerial shell wm size 2>&1) -join "`n"
        $sizeMatches = [regex]::Matches($sizeOutput, '(\d+)x(\d+)')
        if ($sizeMatches.Count -lt 1) {
            throw "Could not determine the Android display size"
        }
        $activeSize = $sizeMatches[$sizeMatches.Count - 1]
        & adb -s $script:deviceSerial shell input tap `
            ([int]([int]$activeSize.Groups[1].Value * 0.90)) `
            ([int]([int]$activeSize.Groups[2].Value * 0.89)) | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap the Yuanbao send button"
        }
        return
    }
    if ($Platform -in @("qwen", "kimi")) {
        $sendBounds = Get-SendButtonBounds `
            -SessionId $SessionId `
            -TargetPlatform $Platform
        if (-not $sendBounds) {
            throw "Could not locate the $Platform send button"
        }
        & adb -s $script:deviceSerial shell input tap `
            $sendBounds.center_x $sendBounds.center_y | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap the $Platform send button"
        }
        return
    }

    switch ($Platform) {
        "deepseek" {
            $send = Find-Element `
                -SessionId $SessionId `
                -Using "xpath" `
                -Value "//*[@content-desc='发送']"
        }
        "kimi" {
            $send = Find-Element `
                -SessionId $SessionId `
                -Using "xpath" `
                -Value "//*[@content-desc='发送讯息']"
        }
        default {
            $send = $null
        }
    }
    if ($send) {
        Click-Element -SessionId $SessionId -ElementId $send
    } else {
        Click-Point -SessionId $SessionId -X 1030 -Y 1430
    }
}

function Get-KimiAnswerContainer {
    param([Parameter(Mandatory)]$Document)

    $candidates = @()
    foreach ($node in @(
        $Document.SelectNodes(
            "//*[@class='android.view.View' and @clickable='true']"
        )
    )) {
        $bounds = Get-Bounds -Node $node
        if (-not $bounds) {
            continue
        }
        $height = $bounds.bottom - $bounds.top
        if (
            $height -lt 100 -or
            $bounds.left -lt 36 -or
            $bounds.right -gt 1116
        ) {
            continue
        }
        $texts = @(Get-DescendantTexts -Node $node)
        $totalTextLength = ($texts | ForEach-Object { $_.Length } |
            Measure-Object -Sum).Sum
        $hasLongText = @($texts | Where-Object { $_.Length -ge 30 }).Count -gt 0
        if (
            $hasLongText -or
            ($texts.Count -ge 3 -and $totalTextLength -ge 60)
        ) {
            $candidates += [pscustomobject]@{
                node = $node
                height = $height
                top = $bounds.top
            }
        }
    }
    $selected = $candidates | Sort-Object top -Descending | Select-Object -First 1
    if ($selected) {
        return $selected.node
    }
    $null
}

function Get-AnswerInfo {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Prompt
    )

    $document = ConvertTo-Xml -Source $Source
    if ($null -eq $document) {
        return @{ answer = $null; reference_count = 0 }
    }
    $referenceCount = 0
    $answerParts = @()

    switch ($Platform) {
        "deepseek" {
            foreach ($node in @($document.SelectNodes("//*[@text]"))) {
                $text = $node.GetAttribute("text").Trim()
                if ($text -match "(?:已阅读\s*)?(\d+)\s*个网页") {
                    $referenceCount = [int]$Matches[1]
                }
            }
            $marker = $document.SelectSingleNode(
                "//*[@text and contains(@text,'个网页')]"
            )
            if ($marker) {
                $container = $marker.ParentNode
                if ($container) {
                    $container = $container.ParentNode
                }
                if ($container) {
                    $answerParts = @(
                        $container.SelectNodes(".//*[@text]") |
                            ForEach-Object { $_.GetAttribute("text").Trim() } |
                            Where-Object {
                                $_.Length -gt 20 -and
                                $_ -notmatch "^已阅读\s*\d+\s*个网页$"
                            }
                    )
                }
            }
        }
        "yuanbao" {
            foreach ($node in @($document.SelectNodes("//*[@text]"))) {
                $text = $node.GetAttribute("text").Trim()
                if ($text -match "^引用来源\s*(\d+)$") {
                    $referenceCount = [int]$Matches[1]
                }
            }
            $answerParts = @(
                $document.SelectNodes("//*[@class='android.widget.TextView' and @text]") |
                    ForEach-Object { $_.GetAttribute("text").Trim() } |
                    Where-Object { $_ -ne $Prompt -and $_.Length -gt 30 } |
                    Sort-Object Length -Descending |
                    Select-Object -First 1
            )
        }
        "qwen" {
            foreach ($node in @($document.SelectNodes("//*[@text]"))) {
                $text = $node.GetAttribute("text").Trim()
                if ($text -match "参考了\s*(\d+)\s*篇资料") {
                    $referenceCount = [int]$Matches[1]
                }
            }
            $promptNode = @(
                $document.SelectNodes(
                    "//*[@class='android.widget.TextView' and @text]"
                ) | Where-Object {
                    $_.GetAttribute("text").Trim() -eq $Prompt
                }
            ) | Select-Object -First 1
            $promptBounds = if ($promptNode) {
                Get-Bounds -Node $promptNode
            } else {
                $null
            }
            $answerCandidates = foreach ($node in @(
                $document.SelectNodes(
                    "//*[@class='android.widget.TextView' and @text]"
                )
            )) {
                $text = $node.GetAttribute("text").Trim()
                $bounds = Get-Bounds -Node $node
                if (
                    -not $text -or
                    $text -eq $Prompt -or
                    -not $bounds -or
                    $bounds.top -ge 1850 -or
                    ($promptBounds -and $bounds.top -lt $promptBounds.bottom) -or
                    $text -match '^(千问|快速|工作助理|AI生视频|生活帮手)$' -or
                    $text -match '^发消息或按住说话' -or
                    $text -match '^内容由 AI 生成' -or
                    $text -match '^参考了\s*\d+\s*篇资料$' -or
                    $text -match '^(正在|思考中|搜索中)'
                ) {
                    continue
                }
                [pscustomobject]@{
                    text = $text
                    top = $bounds.top
                    length = $text.Length
                }
            }
            $selectedAnswer = if ($promptBounds) {
                $answerCandidates |
                    Sort-Object top, @{ Expression = "length"; Descending = $true } |
                    Select-Object -First 1
            } else {
                $answerCandidates |
                    Sort-Object @{ Expression = "length"; Descending = $true }, top |
                    Select-Object -First 1
            }
            $answerParts = @($selectedAnswer.text)
        }
        "kimi" {
            $answerContainer = Get-KimiAnswerContainer -Document $document
            if (-not $answerContainer) {
                break
            }
            $containers = @(
                $answerContainer.SelectNodes(
                    ".//*[@class='android.view.View' and @clickable='true']"
                )
            )
            $sourceNames = @()
            $ignoredSourceLabels = @(
                "快速",
                "进阶",
                "升级订阅",
                "思考已完成",
                "搜索网页",
                "内容由 AI 生成",
                "尽管问，带图也行"
            )
            foreach ($container in $containers) {
                $texts = @(Get-DescendantTexts -Node $container)
                if ($texts.Count -eq 1 -and $texts[0].Length -le 40) {
                    $bounds = Get-Bounds -Node $container
                    if (
                        $bounds -and
                        ($bounds.bottom - $bounds.top) -le 170 -and
                        $texts[0] -notin $ignoredSourceLabels
                    ) {
                        $sourceNames += $texts[0]
                    }
                }
            }
            foreach ($node in @(
                $answerContainer.SelectNodes(
                    ".//*[@class='android.widget.TextView' and @text]"
                )
            )) {
                $text = $node.GetAttribute("text").Trim()
                if (
                    $text -eq $Prompt -or
                    $text.Length -lt 2 -or
                    $text -in $ignoredSourceLabels -or
                    $text -in $sourceNames
                ) {
                    continue
                }
                $answerParts += $text
            }
            if ($answerParts.Count -gt 0) {
                $referenceCount = $sourceNames.Count
            }
        }
    }

    @{
        answer = ($answerParts | Select-Object -Unique) -join "`n"
        reference_count = $referenceCount
    }
}

function Invoke-KimiConversationSwipe {
    param([Parameter(Mandatory)][ValidateSet("up", "down")][string]$Direction)

    if ($Direction -eq "up") {
        $startY = 1800
        $endY = 500
    } else {
        $startY = 500
        $endY = 1800
    }
    & adb -s $script:deviceSerial shell input swipe `
        576 $startY 576 $endY 400 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not scroll the Kimi conversation $Direction"
    }
    Start-Sleep -Milliseconds 700
}

function Get-KimiViewportSignature {
    param([Parameter(Mandatory)][string]$Source)

    $document = ConvertTo-Xml -Source $Source
    if (-not $document) {
        return $Source
    }
    @(
        $document.SelectNodes("//*[@text]") |
            ForEach-Object {
                "{0}|{1}" -f `
                    $_.GetAttribute("bounds"),
                    $_.GetAttribute("text").Trim()
            } |
            Where-Object { $_ -notmatch '\|$' }
    ) -join "`n"
}

function Move-ToKimiConversationTop {
    param([Parameter(Mandatory)][string]$SessionId)

    $source = Get-PageSource -SessionId $SessionId
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $before = Get-KimiViewportSignature -Source $source
        Invoke-KimiConversationSwipe -Direction "down"
        $nextSource = Get-PageSource -SessionId $SessionId
        $after = Get-KimiViewportSignature -Source $nextSource
        $source = $nextSource
        if ($after -eq $before) {
            break
        }
    }
    $source
}

function Get-KimiAnswerSnapshot {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Prompt
    )

    $source = Move-ToKimiConversationTop -SessionId $SessionId
    $parts = [Collections.Generic.List[string]]::new()
    $seenParts = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::Ordinal
    )
    $seenViewports = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::Ordinal
    )
    $referenceCount = 0
    for ($viewport = 0; $viewport -lt 24; $viewport++) {
        $signature = Get-KimiViewportSignature -Source $source
        if (-not $seenViewports.Add($signature)) {
            break
        }
        $info = Get-AnswerInfo -Source $source -Prompt $Prompt
        foreach ($part in @($info.answer -split "`n")) {
            $part = $part.Trim()
            if ($part -and $seenParts.Add($part)) {
                $parts.Add($part)
            }
        }
        $referenceCount += [int]$info.reference_count
        Invoke-KimiConversationSwipe -Direction "up"
        $source = Get-PageSource -SessionId $SessionId
    }
    if ($parts.Count -eq 0) {
        throw "Kimi completed without an accessible answer"
    }
    @{
        source = $source
        answer = $parts -join "`n"
        reference_count = $referenceCount
    }
}

function Wait-ForAnswer {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Prompt,
        [Parameter(Mandatory)][int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastAnswer = $null
    $stableCount = 0
    $firstTokenAt = $null
    if ($Platform -in @("deepseek", "yuanbao")) {
        do {
            Start-Sleep -Seconds 3
            try {
                $info = if ($Platform -eq "deepseek") {
                    Get-DeepSeekAnswerSnapshot -SessionId $SessionId
                } else {
                    Get-YuanbaoAnswerSnapshot -SessionId $SessionId
                }
            } catch {
                Write-GatewayTrace "$Platform snapshot unavailable: $($_.Exception.Message)"
                $info = $null
            }
            if (-not $info -or -not $info.answer) {
                continue
            }
            if (-not $firstTokenAt) {
                $firstTokenAt = Get-Date
            }
            if ($info.answer -eq $lastAnswer) {
                $stableCount++
            } else {
                $stableCount = 0
                $lastAnswer = $info.answer
            }
            if ($stableCount -ge 1) {
                $info.first_token_at = $firstTokenAt
                return $info
            }
        } while ((Get-Date) -lt $deadline)
        throw "Timed out waiting for $Platform response after $TimeoutSeconds seconds"
    }
    do {
        Start-Sleep -Seconds 3
        $source = Get-PageSource -SessionId $SessionId
        if (
            $Platform -eq "kimi" -and
            $source -match "Kimi有点累了|高峰(?:期|时段)算力不足"
        ) {
            throw "Kimi is temporarily unavailable due to peak demand"
        }
        $info = Get-AnswerInfo -Source $source -Prompt $Prompt
        if ($info.answer -and -not $firstTokenAt) {
            $firstTokenAt = Get-Date
        }
        if ($info.answer -and $info.answer -eq $lastAnswer) {
            $stableCount++
        } else {
            $stableCount = 0
            $lastAnswer = $info.answer
        }
        $explicitComplete = $false
        $explicitComplete = $info.reference_count -gt 0 -and $stableCount -ge 1
        $stableComplete = $stableCount -ge 2
        if ($Platform -eq "qwen") {
            # Qwen can pause for several seconds after announcing a search.
            # A short stable window captured only that preamble in production.
            $minimumGenerationTimeReached = (
                $firstTokenAt -and
                ((Get-Date) - $firstTokenAt).TotalSeconds -ge 30
            )
            $explicitComplete = (
                $minimumGenerationTimeReached -and
                $info.reference_count -gt 0 -and
                $stableCount -ge 1
            )
            $stableComplete = (
                $minimumGenerationTimeReached -and
                $stableCount -ge 3
            )
        } elseif ($Platform -eq "kimi") {
            # During generation Kimi exposes the square stop control through
            # the stale accessibility label "发送讯息". Completed answers
            # restore the voice-input control, even when a hidden send node
            # remains. Long answers can keep changing their lazy accessibility
            # subtree after generation, so text equality is not a valid gate.
            $generationComplete = (
                $source -match 'content-desc="切换至语音输入"'
            )
            $minimumGenerationTimeReached = (
                $firstTokenAt -and
                ((Get-Date) - $firstTokenAt).TotalSeconds -ge 3
            )
            $explicitComplete = (
                $generationComplete -and
                $minimumGenerationTimeReached
            )
            $stableComplete = $false
        }
        if ($info.answer -and ($explicitComplete -or $stableComplete)) {
            if ($Platform -eq "kimi") {
                $info = Get-KimiAnswerSnapshot `
                    -SessionId $SessionId `
                    -Prompt $Prompt
                $source = $info.source
            }
            return @{
                source = $source
                answer = $info.answer
                reference_count = $info.reference_count
                first_token_at = $firstTokenAt
            }
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $Platform response after $TimeoutSeconds seconds"
}

function New-SourceRecord {
    param(
        [Parameter(Mandatory)][int]$Index,
        [AllowNull()][string]$Title,
        [AllowNull()][string]$SiteName,
        [AllowNull()][string]$Domain,
        [AllowNull()][string]$Url,
        [Parameter(Mandatory)][string]$Resolution,
        [string]$Status = "collected",
        [AllowNull()][string]$ErrorMessage
    )

    [pscustomobject][ordered]@{
        index = $Index
        title = $Title
        site_name = $SiteName
        page_title = $null
        domain = $Domain
        url = $Url
        raw_url = $Url
        url_resolution = $Resolution
        status = $Status
        error_message = $ErrorMessage
    }
}

function Return-ToDeepSeekSourcePanel {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        $source = Get-PageSource -SessionId $SessionId
        if ($source -match 'text="搜索结果"') {
            return
        }
        if ($SessionId -eq "adb") {
            Press-Back -SessionId $SessionId
            Start-Sleep -Milliseconds 700
            continue
        }
        $close = Find-Element `
            -SessionId $SessionId `
            -Using "xpath" `
            -Value "//*[@content-desc='关闭']" `
            -TimeoutSeconds 1 `
            -Optional
        if ($close) {
            try {
                Click-Element -SessionId $SessionId -ElementId $close
            } catch {
                Press-Back -SessionId $SessionId
            }
        } else {
            Press-Back -SessionId $SessionId
        }
        Start-Sleep -Milliseconds 700
    }
    throw "Could not return to the DeepSeek source panel"
}

function Return-ToYuanbaoSourcePanel {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -ne $packageName) {
            if (
                $foregroundPackage -and
                $foregroundPackage -notmatch '^com\.huawei\.android\.launcher$'
            ) {
                & adb -s $script:deviceSerial shell am force-stop `
                    $foregroundPackage | Out-Null
            }
            Start-Sleep -Milliseconds 750
            continue
        }
        $source = Get-PageSource -SessionId $SessionId
        if ($source -match 'text="引用来源\s*\d+"') {
            return
        }
        if ($source -match 'resource-id="activity-detail"') {
            & adb -s $script:deviceSerial shell input tap 114 222 | Out-Null
            Start-Sleep -Milliseconds 700
            continue
        }
        $document = ConvertTo-Xml -Source $source
        $returnNode = if ($document) {
            $document.SelectSingleNode(
                "//*[@text='返回' or @content-desc='返回']"
            )
        } else {
            $null
        }
        $returnBounds = if ($returnNode) {
            Get-Bounds -Node $returnNode
        } else {
            $null
        }
        if (-not $returnBounds -and $document) {
            foreach ($candidateNode in @($document.SelectNodes("//*[@clickable='true']"))) {
                $candidateBounds = Get-Bounds -Node $candidateNode
                if (
                    $candidateBounds -and
                    $candidateBounds.left -le 200 -and
                    $candidateBounds.top -ge 100 -and
                    $candidateBounds.top -le 350 -and
                    ($candidateBounds.right - $candidateBounds.left) -ge 60 -and
                    ($candidateBounds.bottom - $candidateBounds.top) -ge 60
                ) {
                    $returnBounds = $candidateBounds
                    break
                }
            }
        }
        if ($returnBounds) {
            & adb -s $script:deviceSerial shell input tap `
                $returnBounds.center_x $returnBounds.center_y | Out-Null
        } else {
            Press-Back -SessionId $SessionId
        }
        Start-Sleep -Milliseconds 700
    }
    throw "Could not return to the Yuanbao source panel"
}

function Get-ForegroundPackage {
    $output = (
        & adb -s $script:deviceSerial shell dumpsys window
    ) -join "`n"
    if ($output -match 'mCurrentFocus=Window\{[^\r\n]*?\s([a-zA-Z0-9._]+)/') {
        return $Matches[1]
    }
    foreach ($line in @(
        & adb -s $script:deviceSerial shell dumpsys activity activities
    )) {
        if ($line -match 'mResumedActivity:.*\s([a-zA-Z0-9._]+)/') {
            return [string]$Matches[1]
        }
    }
    $null
}

function Invoke-YuanbaoCopyLink {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        if (-not $document.SelectSingleNode(
            "//*[@content-desc='复制链接' or @text='复制链接']"
        )) {
            throw "Yuanbao share sheet did not expose Copy Link"
        }
        $focused = $document.SelectSingleNode("//*[@focused='true']")
        if ($focused) {
            $copyNode = $focused.SelectSingleNode(
                ".//*[@content-desc='复制链接' or @text='复制链接']"
            )
            if (
                $copyNode -or
                $focused.GetAttribute("content-desc") -eq "复制链接" -or
                $focused.GetAttribute("text") -eq "复制链接"
            ) {
                & adb -s $script:deviceSerial shell input keyevent 66 | Out-Null
                Start-Sleep -Milliseconds 500
                return
            }
        }
        & adb -s $script:deviceSerial shell input keyevent 61 | Out-Null
        Start-Sleep -Milliseconds 250
    }
    throw "Could not focus Yuanbao's Copy Link share action"
}

function Close-YuanbaoShareSheet {
    param([Parameter(Mandatory)][string]$SessionId)

    & adb -s $script:deviceSerial shell input tap 1068 1648 | Out-Null
    Start-Sleep -Milliseconds 700
}

function Resolve-YuanbaoSourceUrl {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)]$Record,
        [Parameter(Mandatory)]$Bounds
    )

    $disabledPackage = $null
    $clipboardBefore = $null
    try {
        try {
            $clipboardBefore = Get-ClipboardText -SessionId $SessionId
        } catch {}
        Write-GatewayTrace "source $($Record.index) open"
        & adb -s $script:deviceSerial shell input tap `
            $Bounds.center_x $Bounds.center_y | Out-Null
        Start-Sleep -Seconds 2

        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -and $foregroundPackage -ne $packageName) {
            Write-GatewayTrace "source $($Record.index) external $foregroundPackage"
            # Installed apps may claim a source's App Link. Disable only the
            # matched package for this retry so Android falls back to the web.
            Press-Back -SessionId $SessionId
            Start-Sleep -Milliseconds 700
            Return-ToYuanbaoSourcePanel -SessionId $SessionId
            & adb -s $script:deviceSerial shell pm disable-user `
                --user 0 $foregroundPackage | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not temporarily disable source app $foregroundPackage"
            }
            $disabledPackage = $foregroundPackage
            & adb -s $script:deviceSerial shell input tap `
                $Bounds.center_x $Bounds.center_y | Out-Null
            Start-Sleep -Seconds 2
            $foregroundPackage = Get-ForegroundPackage
            if ($foregroundPackage -and $foregroundPackage -ne $packageName) {
                throw "Yuanbao source opened unsupported external app $foregroundPackage"
            }
        }

        $detailDocument = ConvertTo-Xml -Source (
            Get-PageSource -SessionId $SessionId
        )
        Write-GatewayTrace "source $($Record.index) detail"
        $menuBounds = $null
        foreach ($node in @($detailDocument.SelectNodes("//*[@clickable='true']"))) {
            $candidate = Get-Bounds -Node $node
            if (
                $candidate -and
                $candidate.left -ge 850 -and
                $candidate.top -ge 100 -and
                $candidate.bottom -le 350 -and
                ($candidate.right - $candidate.left) -ge 60 -and
                ($candidate.bottom - $candidate.top) -ge 60 -and
                (-not $menuBounds -or $candidate.left -gt $menuBounds.left)
            ) {
                $menuBounds = $candidate
            }
        }
        if (-not $menuBounds) {
            throw "Yuanbao source detail menu was not found"
        }
        & adb -s $script:deviceSerial shell input tap `
            $menuBounds.center_x $menuBounds.center_y | Out-Null
        Start-Sleep -Seconds 1

        # Huawei blocks shell touch events on its share sheet. Hardware focus
        # navigation remains available and is verified against native bounds.
        Invoke-YuanbaoCopyLink -SessionId $SessionId

        $postCopyState = Get-PageSource -SessionId $SessionId
        if ($postCopyState -match '复制链接|Close sheet') {
            throw "Yuanbao Copy Link action did not close the share sheet"
        }

        $rawUrl = Get-ClipboardText -SessionId $SessionId
        if ($rawUrl -eq $clipboardBefore) {
            Write-GatewayTrace "source $($Record.index) clipboard unchanged; retry"
            & adb -s $script:deviceSerial shell input tap `
                $menuBounds.center_x $menuBounds.center_y | Out-Null
            Start-Sleep -Seconds 1
            Invoke-YuanbaoCopyLink -SessionId $SessionId
            $rawUrl = Get-ClipboardText -SessionId $SessionId
        }
        Write-GatewayTrace "source $($Record.index) clipboard $rawUrl"
        if ($rawUrl -eq $clipboardBefore) {
            throw "Yuanbao Copy Link did not update the clipboard"
        }
        if ($rawUrl -notmatch '^https?://') {
            throw "Yuanbao copied an invalid source URL"
        }
        $url = ConvertTo-CanonicalUrl -Url $rawUrl
        $Record.raw_url = $rawUrl
        $Record.url = $url
        $Record.domain = Get-Host -Url $url
        $Record.url_resolution = "exact"
    } catch {
        $Record.status = "failed"
        $Record.error_message = $_.Exception.Message
        Write-GatewayTrace "source $($Record.index) failed $($Record.error_message)"
    } finally {
        try {
            $state = Get-PageSource -SessionId $SessionId
            if ($state -match '复制链接|Close sheet') {
                Close-YuanbaoShareSheet -SessionId $SessionId
            }
            Return-ToYuanbaoSourcePanel -SessionId $SessionId
        } catch {
            if ($Record.status -ne "failed") {
                $Record.status = "failed"
                $Record.error_message = $_.Exception.Message
            }
        }
        if ($disabledPackage) {
            & adb -s $script:deviceSerial shell pm enable $disabledPackage | Out-Null
        }
    }
}

function Get-DeepSeekSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    $answerDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
    $markerNode = $answerDocument.SelectSingleNode(
        "//*[@text='$ReferenceCount 个网页' or @text='已阅读 $ReferenceCount 个网页']"
    )
    $markerBounds = if ($markerNode) { Get-Bounds -Node $markerNode } else { $null }
    if (-not $markerBounds) {
        throw "DeepSeek source marker was not found"
    }
    & adb -s $script:deviceSerial shell input tap `
        $markerBounds.center_x $markerBounds.center_y | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "ADB failed to open the DeepSeek source panel"
    }
    Start-Sleep -Seconds 1
    $collected = @{}
    $stalls = 0
    while ($collected.Count -lt $ReferenceCount -and $stalls -lt 5) {
        $panelSource = Get-PageSource -SessionId $SessionId
        if (
            $Platform -eq "yuanbao" -and
            $panelSource -notmatch 'text="引用来源\s*\d+"'
        ) {
            throw "Yuanbao left the source panel during collection"
        }
        $document = ConvertTo-Xml -Source $panelSource
        $processed = $false
        foreach ($item in @(
            $document.SelectNodes(
                "//*[@class='android.view.View' and @clickable='true']"
            )
        )) {
            $texts = @(Get-DescendantTexts -Node $item)
            $ordinal = $null
            foreach ($text in $texts) {
                if ($text -match "^\d+$") {
                    $value = [int]$text
                    if ($value -ge 1 -and $value -le $ReferenceCount) {
                        $ordinal = $value
                        break
                    }
                }
            }
            if (-not $ordinal -or $collected.ContainsKey([string]$ordinal)) {
                continue
            }
            $filtered = @(
                $texts |
                    Where-Object {
                        $_ -notmatch "^\d+$" -and
                        $_ -notmatch "^\d{4}/\d{2}/\d{2}$"
                    }
            )
            if ($filtered.Count -lt 2) {
                continue
            }
            $siteName = $filtered[0]
            $title = $filtered[1]
            $bounds = Get-Bounds -Node $item
            if (-not $bounds) {
                continue
            }
            $processed = $true
            $record = New-SourceRecord `
                -Index $ordinal `
                -Title $title `
                -SiteName $siteName `
                -Domain $null `
                -Url $null `
                -Resolution "unavailable"
            try {
                Write-GatewayTrace "deepseek source $ordinal open"
                Click-Point `
                    -SessionId $SessionId `
                    -X $bounds.center_x `
                    -Y $bounds.center_y
                $openBounds = $null
                $pageSource = $null
                $openDeadline = (Get-Date).AddSeconds(12)
                do {
                    Start-Sleep -Milliseconds 500
                    $pageSource = Get-PageSource -SessionId $SessionId
                    $pageDocument = ConvertTo-Xml -Source $pageSource
                    $openNode = $pageDocument.SelectSingleNode(
                        "//*[@content-desc='在浏览器中打开']"
                    )
                    $openBounds = if ($openNode) {
                        Get-Bounds -Node $openNode
                    } else {
                        $null
                    }
                    if (-not $openBounds) {
                        foreach ($candidateNode in @(
                            $pageDocument.SelectNodes("//*[@clickable='true']")
                        )) {
                            $candidateBounds = Get-Bounds -Node $candidateNode
                            if (
                                $candidateBounds -and
                                $candidateBounds.left -ge 900 -and
                                $candidateBounds.top -ge 120 -and
                                $candidateBounds.bottom -le 450
                            ) {
                                $openBounds = $candidateBounds
                                break
                            }
                        }
                    }
                } while (-not $openBounds -and (Get-Date) -lt $openDeadline)
                if (-not $openBounds) {
                    throw "DeepSeek source page did not expose Open in browser"
                }
                $pageDocument = ConvertTo-Xml -Source $pageSource
                $pageTitleNode = $pageDocument.SelectSingleNode(
                    "//*[@class='android.widget.TextView' and @text]"
                )
                if ($pageTitleNode) {
                    $record.page_title = $pageTitleNode.GetAttribute("text")
                }
                $embeddedUrl = Get-ResolverUrl
                if ($embeddedUrl) {
                    Write-GatewayTrace `
                        "deepseek source $ordinal embedded $embeddedUrl"
                }
                & adb -s $script:deviceSerial shell input tap `
                    $openBounds.center_x $openBounds.center_y | Out-Null
                Start-Sleep -Milliseconds 500
                $confirmDocument = ConvertTo-Xml -Source (
                    Get-PageSource -SessionId $SessionId
                )
                $allowNode = $confirmDocument.SelectSingleNode(
                    "//*[@text='允许' or @content-desc='允许']"
                )
                $allowBounds = if ($allowNode) {
                    Get-Bounds -Node $allowNode
                } else {
                    $null
                }
                if ($allowBounds) {
                    & adb -s $script:deviceSerial shell input tap `
                        $allowBounds.center_x $allowBounds.center_y | Out-Null
                }
                Start-Sleep -Seconds 2
                $rawUrl = Get-ResolverUrl
                if (-not $rawUrl) {
                    $rawUrl = $embeddedUrl
                }
                if (-not $rawUrl) {
                    throw "Android resolver did not expose the source URL"
                }
                $url = ConvertTo-CanonicalUrl -Url $rawUrl
                $record.raw_url = $rawUrl
                $record.url = $url
                $record.domain = Get-Host -Url $url
                $record.url_resolution = "exact"
                Write-GatewayTrace "deepseek source $ordinal resolved $url"
                $externalPackage = Get-ExternalUrlHandlerPackage
                if ($externalPackage) {
                    Write-GatewayTrace `
                        "deepseek source $ordinal close external $externalPackage"
                    & adb -s $script:deviceSerial shell am force-stop `
                        $externalPackage | Out-Null
                    Resume-DeepSeekApp -Serial $script:deviceSerial
                } else {
                    Press-Back -SessionId $SessionId
                }
                Start-Sleep -Milliseconds 500
                Return-ToDeepSeekSourcePanel -SessionId $SessionId
            } catch {
                $record.status = "failed"
                $record.error_message = $_.Exception.Message
                Write-GatewayTrace `
                    "deepseek source $ordinal failed: $($_.Exception.Message)"
                try {
                    Resume-DeepSeekApp -Serial $script:deviceSerial
                    Start-Sleep -Milliseconds 500
                    Return-ToDeepSeekSourcePanel -SessionId $SessionId
                } catch {}
            }
            $collected[[string]$ordinal] = $record
            break
        }
        if ($processed) {
            $stalls = 0
            continue
        }
        if (Scroll-Region -SessionId $SessionId) {
            Start-Sleep -Milliseconds 700
        } else {
            $stalls++
        }
    }
    @($collected.Values | Sort-Object index)
}

function Get-YuanbaoVisiblePanelItems {
    param([Parameter(Mandatory)]$Document)

    $items = @{}
    foreach ($node in @($Document.SelectNodes("//*[@clickable='true']"))) {
        $texts = @(Get-DescendantTexts -Node $node)
        if ($texts.Count -lt 2 -or $texts.Count -gt 3) {
            continue
        }
        $bounds = Get-Bounds -Node $node
        if (-not $bounds) {
            continue
        }
        # Video citations legitimately omit a snippet. A two-text card clipped
        # against the panel header is incomplete and will be rediscovered after
        # the next overlapping scroll.
        if ($texts.Count -eq 2 -and $bounds.top -lt 300) {
            continue
        }
        $signature = $texts -join "`n"
        if (-not $items.ContainsKey($signature)) {
            $items[$signature] = [pscustomobject]@{
                signature = $signature
                site_name = $texts[0]
                title = $texts[1]
                snippet = if ($texts.Count -eq 3) { $texts[2] } else { $null }
                bounds = $bounds
            }
        }
    }
    @($items.Values | Sort-Object { $_.bounds.top }, { $_.bounds.left })
}

function Get-YuanbaoSourceCatalog {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    $catalog = [Collections.Generic.List[object]]::new()
    $known = @{}
    $stalls = 0
    while ($catalog.Count -lt $ReferenceCount -and $stalls -lt 6) {
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $foundNew = $false
        foreach ($item in @(Get-YuanbaoVisiblePanelItems -Document $document)) {
            if ($known.ContainsKey($item.signature)) {
                continue
            }
            $known[$item.signature] = $true
            $catalog.Add([pscustomobject]@{
                index = $catalog.Count + 1
                signature = $item.signature
                site_name = $item.site_name
                title = $item.title
                snippet = $item.snippet
            })
            $foundNew = $true
            if ($catalog.Count -ge $ReferenceCount) {
                break
            }
        }
        if ($catalog.Count -ge $ReferenceCount) {
            break
        }
        & adb -s $script:deviceSerial shell input swipe 576 1900 576 900 500 | Out-Null
        Start-Sleep -Milliseconds 700
        if ($foundNew) {
            $stalls = 0
        } else {
            $stalls++
        }
    }
    @($catalog)
}

function Reset-YuanbaoSourcePanel {
    param([Parameter(Mandatory)][string]$SessionId)

    Press-Back -SessionId $SessionId
    Start-Sleep -Milliseconds 700
    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        if ($document.SelectSingleNode(
            "//*[starts-with(@text,'引用来源')]"
        )) {
            Press-Back -SessionId $SessionId
            Start-Sleep -Milliseconds 700
            continue
        }
        $markerNode = $document.SelectSingleNode(
            "//*[@text='源' or @content-desc='源']"
        )
        $markerBounds = if ($markerNode) { Get-Bounds -Node $markerNode } else { $null }
        if ($markerBounds) {
            & adb -s $script:deviceSerial shell input tap `
                $markerBounds.center_x $markerBounds.center_y | Out-Null
            Start-Sleep -Milliseconds 700
            $panelSource = Get-PageSource -SessionId $SessionId
            if ($panelSource -match 'text="引用来源\s*\d+"') {
                return
            }
        }
        & adb -s $script:deviceSerial shell input swipe 842 1650 842 650 350 | Out-Null
        Start-Sleep -Milliseconds 500
    }
    throw "Could not reopen the Yuanbao source panel"
}

function Find-YuanbaoSourceBounds {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Signature,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    $stalls = 0
    $lastViewport = $null
    for ($attempt = 0; $attempt -lt ([math]::Max(12, $ReferenceCount + 4)); $attempt++) {
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $items = @(Get-YuanbaoVisiblePanelItems -Document $document)
        $match = @($items | Where-Object { $_.signature -eq $Signature }) |
            Select-Object -First 1
        if ($match) {
            return $match.bounds
        }
        $viewport = ($items.signature | Sort-Object) -join "`r`n"
        if ($viewport -and $viewport -eq $lastViewport) {
            $stalls++
        } else {
            $stalls = 0
            $lastViewport = $viewport
        }
        if ($stalls -ge 3) {
            break
        }
        & adb -s $script:deviceSerial shell input swipe 576 1900 576 900 500 | Out-Null
        Start-Sleep -Milliseconds 700
    }
    $null
}

function Get-QwenResearchSourceTitles {
    param([Parameter(Mandatory)]$Document)

    $titles = [Collections.Generic.List[string]]::new()
    foreach ($marker in @($Document.SelectNodes(
        "//*[contains(@text,'搜索') and contains(@text,'参考了') and " +
        "contains(@text,'篇资料')]"
    ))) {
        $expectedCount = 0
        if ($marker.GetAttribute("text") -match '参考了\s*(\d+)\s*篇资料') {
            $expectedCount = [int]$Matches[1]
        }
        if ($expectedCount -lt 1 -or -not $marker.ParentNode) {
            continue
        }
        $candidateContainers = foreach ($container in @(
            $marker.ParentNode.SelectNodes("./node[@class='android.view.View']")
        )) {
            $containerTitles = @(
                $container.SelectNodes(
                    ".//*[@class='android.widget.TextView' and @text]"
                ) | ForEach-Object { $_.GetAttribute("text").Trim() } |
                    Where-Object {
                        $_ -and
                        $_ -ne "展开全部" -and
                        $_ -notmatch '^“.*”$'
                    }
            )
            if ($containerTitles.Count -gt 0) {
                [pscustomobject]@{
                    titles = $containerTitles
                    count = $containerTitles.Count
                }
            }
        }
        $sourceContainer = @($candidateContainers | Sort-Object count -Descending) |
            Select-Object -First 1
        if (-not $sourceContainer) {
            continue
        }
        foreach ($title in @($sourceContainer.titles | Select-Object -First $expectedCount)) {
            $titles.Add($title)
        }
    }
    @($titles)
}

function Get-PanelSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    if ($Platform -eq "qwen" -and $ReferenceCount -lt 1) {
        return @{
            reference_count = 0
            sources = @()
        }
    }
    if ($Platform -eq "yuanbao") {
        Write-GatewayTrace "source marker lookup"
        $answerDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $markerNode = $answerDocument.SelectSingleNode(
            "//*[@text='源' or @content-desc='源']"
        )
        $markerBounds = if ($markerNode) { Get-Bounds -Node $markerNode } else { $null }
        if (-not $markerBounds) {
            if ($ReferenceCount -lt 1) {
                return @()
            }
            throw "Yuanbao source marker was not found"
        }
        & adb -s $script:deviceSerial shell input tap `
            $markerBounds.center_x $markerBounds.center_y | Out-Null
        Write-GatewayTrace "source panel opened"
    } else {
        $answerDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $markerNode = $answerDocument.SelectSingleNode(
            "//*[contains(@text,'参考了') and contains(@text,'篇资料')]"
        )
        $markerBounds = if ($markerNode) { Get-Bounds -Node $markerNode } else { $null }
        if (-not $markerBounds) {
            throw "Qwen source marker was not found"
        }
        & adb -s $script:deviceSerial shell input tap `
            $markerBounds.center_x $markerBounds.center_y | Out-Null
    }
    Start-Sleep -Seconds 1
    $panelSource = Get-PageSource -SessionId $SessionId
    if ($panelSource -match "引用来源\s*(\d+)") {
        # The answer view can expose a stale intermediate count while product
        # cards are still loading. The opened panel is authoritative.
        $ReferenceCount = [int]$Matches[1]
    }
    if ($ReferenceCount -lt 1) {
        throw "$Platform source panel did not expose a reference count"
    }
    if ($Platform -eq "qwen") {
        $researchTitles = @(Get-QwenResearchSourceTitles `
            -Document (ConvertTo-Xml -Source $panelSource))
        if ($researchTitles.Count -gt 0) {
            $records = @()
            for ($index = 1; $index -le $ReferenceCount; $index++) {
                $title = if ($index -le $researchTitles.Count) {
                    $researchTitles[$index - 1]
                } else {
                    $null
                }
                if ($title -eq "None") {
                    $title = $null
                }
                $records += New-SourceRecord `
                    -Index $index `
                    -Title $title `
                    -SiteName $null `
                    -Domain $null `
                    -Url $null `
                    -Resolution "unavailable" `
                    -Status "failed" `
                    -ErrorMessage $(if ($title) {
                        "Qwen research mode did not expose the source URL"
                    } else {
                        "Reference item was not exposed by the Qwen UI"
                    })
            }
            return @{
                reference_count = $ReferenceCount
                sources = $records
            }
        }
    }
    if ($Platform -eq "yuanbao") {
        $catalog = @(Get-YuanbaoSourceCatalog `
            -SessionId $SessionId `
            -ReferenceCount $ReferenceCount)
        $resolved = @()
        foreach ($catalogItem in $catalog) {
            $record = New-SourceRecord `
                -Index $catalogItem.index `
                -Title $catalogItem.title `
                -SiteName $catalogItem.site_name `
                -Domain $null `
                -Url $null `
                -Resolution "unavailable"
            try {
                Reset-YuanbaoSourcePanel -SessionId $SessionId
                $bounds = Find-YuanbaoSourceBounds `
                    -SessionId $SessionId `
                    -Signature $catalogItem.signature `
                    -ReferenceCount $ReferenceCount
                if (-not $bounds) {
                    throw "Yuanbao source item was not exposed after paging"
                }
                Resolve-YuanbaoSourceUrl `
                    -SessionId $SessionId `
                    -Record $record `
                    -Bounds $bounds
            } catch {
                $record.status = "failed"
                $record.error_message = $_.Exception.Message
            }
            $resolved += $record
        }
        for ($missing = $resolved.Count + 1; $missing -le $ReferenceCount; $missing++) {
            $resolved += New-SourceRecord `
                -Index $missing `
                -Title $null `
                -SiteName $null `
                -Domain $null `
                -Url $null `
                -Resolution "unavailable" `
                -Status "failed" `
                -ErrorMessage "Reference item was not exposed by the Yuanbao UI"
        }
        return @{
            reference_count = $ReferenceCount
            sources = @($resolved | Sort-Object index)
        }
    }
    $collected = @{}
    $stalls = 0
    while ($collected.Count -lt $ReferenceCount -and $stalls -lt 5) {
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $foundNew = $false
        foreach ($item in @(
            $document.SelectNodes("//*[@clickable='true']")
        )) {
            $texts = @(Get-DescendantTexts -Node $item)
            if ($Platform -eq "qwen") {
                if ($texts.Count -lt 3 -or $texts[0] -notmatch "^(\d+)\.\s*(.+)$") {
                    continue
                }
                $index = [int]$Matches[1]
                $title = $Matches[2]
                $siteName = $texts[1]
                $domain = if ($texts[2] -match "^[a-z0-9.-]+\.[a-z]{2,}$") {
                    $texts[2].ToLowerInvariant()
                } else {
                    $null
                }
            } else {
                if ($texts.Count -ne 3) {
                    continue
                }
                $index = 0
                $siteName = $texts[0]
                $title = $texts[1]
                $domain = $null
                foreach ($existing in $collected.Values) {
                    if (
                        $existing.title -eq $title -and
                        $existing.site_name -eq $siteName
                    ) {
                        $index = -1
                        break
                    }
                }
                if ($index -eq -1) {
                    continue
                }
                $index = $collected.Count + 1
            }
            if (
                $index -lt 1 -or
                $index -gt $ReferenceCount -or
                $collected.ContainsKey([string]$index)
            ) {
                continue
            }
            $bounds = Get-Bounds -Node $item
            if (-not $bounds) {
                continue
            }
            $url = if ($domain) { "https://$domain/" } else { $null }
            $resolution = if ($url) { "site_root" } else { "unavailable" }
            $record = New-SourceRecord `
                -Index $index `
                -Title $title `
                -SiteName $siteName `
                -Domain $domain `
                -Url $url `
                -Resolution $resolution
            if ($Platform -eq "yuanbao") {
                Resolve-YuanbaoSourceUrl `
                    -SessionId $SessionId `
                    -Record $record `
                    -Bounds $bounds
                # Resolve failures are recorded per source, but losing the
                # panel invalidates every subsequent coordinate and title.
                Return-ToYuanbaoSourcePanel -SessionId $SessionId
            }
            $collected[[string]$index] = $record
            $foundNew = $true
            if ($Platform -eq "yuanbao") {
                # Opening a source and returning rebuilds the panel. Any
                # remaining bounds from this document are stale and can point
                # into Yuanbao's recommendation feed instead of the next
                # citation, so refresh the hierarchy after every record.
                break
            }
        }
        if ($collected.Count -ge $ReferenceCount) {
            break
        }
        $didScroll = if ($Platform -eq "yuanbao") {
            & adb -s $script:deviceSerial shell input swipe 576 1900 576 900 500 | Out-Null
            $LASTEXITCODE -eq 0
        } else {
            Scroll-Region -SessionId $SessionId -Top 850 -Height 1450
        }
        if ($foundNew) {
            $stalls = 0
        } else {
            # ADB only confirms that the gesture was injected, not that the
            # panel actually moved. Bound retries by observable new records.
            $stalls++
        }
        if ($didScroll) {
            Start-Sleep -Milliseconds 700
        }
    }
    @{
        reference_count = $ReferenceCount
        sources = @($collected.Values | Sort-Object index)
    }
}

function Get-KimiSearchCards {
    param([Parameter(Mandatory)][string]$Source)

    $document = ConvertTo-Xml -Source $Source
    if (-not $document) {
        return @()
    }
    $cards = foreach ($node in @(
        $document.SelectNodes(
            "//*[@class='android.view.View' and @clickable='true']"
        )
    )) {
        $bounds = Get-Bounds -Node $node
        if (
            -not $bounds -or
            $bounds.left -gt 60 -or
            $bounds.right -lt 1020 -or
            ($bounds.bottom - $bounds.top) -lt 220 -or
            ($bounds.bottom - $bounds.top) -gt 750
        ) {
            continue
        }
        $texts = @(
            $node.SelectNodes(
                ".//*[@class='android.widget.TextView' and @text]"
            ) |
                ForEach-Object {
                    $textBounds = Get-Bounds -Node $_
                    $text = $_.GetAttribute("text").Trim()
                    if ($text -and $textBounds) {
                        [pscustomobject]@{
                            text = $text
                            top = $textBounds.top
                            left = $textBounds.left
                        }
                    }
                } |
                Sort-Object top, left
        )
        if ($texts.Count -lt 2) {
            continue
        }
        $siteName = $texts[0].text
        $title = @(
            $texts | Select-Object -Skip 1 | Where-Object {
                $_.text.Length -ge 6 -and
                $_.text -notmatch '^\d{4}(?:[-/.]\d{1,2}){1,2}$' -and
                $_.text -notmatch '^\d{4}年\d{1,2}月\d{1,2}日$'
            }
        ) | Select-Object -First 1
        if (-not $title) {
            continue
        }
        [pscustomobject]@{
            key = "{0}|{1}" -f $siteName, $title.text
            site_name = $siteName
            title = $title.text
            bounds = $bounds
        }
    }
    @($cards)
}

function Test-KimiSearchPanel {
    param([Parameter(Mandatory)][string]$Source)

    $document = ConvertTo-Xml -Source $Source
    if (-not $document) {
        return $false
    }
    $header = $document.SelectSingleNode(
        "//*[@class='android.widget.TextView' and @text='搜索网页']"
    )
    $headerBounds = if ($header) { Get-Bounds -Node $header } else { $null }
    [bool](
        $headerBounds -and
        $headerBounds.top -ge 250 -and
        $headerBounds.top -le 450 -and
        @(Get-KimiSearchCards -Source $Source).Count -gt 0
    )
}

function Invoke-KimiSearchPanelSwipe {
    param([Parameter(Mandatory)][ValidateSet("up", "down")][string]$Direction)

    if ($Direction -eq "up") {
        $startY = 1800
        $endY = 650
    } else {
        $startY = 650
        $endY = 1800
    }
    & adb -s $script:deviceSerial shell input swipe `
        540 $startY 540 $endY 400 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not scroll the Kimi search panel $Direction"
    }
    Start-Sleep -Milliseconds 700
}

function Get-KimiSearchViewportSignature {
    param([Parameter(Mandatory)][string]$Source)

    @(
        Get-KimiSearchCards -Source $Source |
            ForEach-Object { $_.key }
    ) -join "`n"
}

function Get-KimiPageSource {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            return Get-PageSource -SessionId $SessionId
        } catch {
            if ($attempt -ge 2) {
                throw
            }
            Start-Sleep -Seconds 1
        }
    }
}

function Open-KimiSearchPanel {
    param([Parameter(Mandatory)][string]$SessionId)

    $source = Move-ToKimiConversationTop -SessionId $SessionId
    $document = ConvertTo-Xml -Source $source
    $searchNode = $document.SelectSingleNode(
        "//*[@class='android.widget.TextView' and @text='搜索网页']"
    )
    if (-not $searchNode) {
        throw "Kimi answer did not expose its searched web pages"
    }
    while (
        $searchNode -and
        $searchNode.GetAttribute("clickable") -ne "true"
    ) {
        $searchNode = $searchNode.ParentNode
    }
    $bounds = if ($searchNode) { Get-Bounds -Node $searchNode } else { $null }
    if (-not $bounds) {
        throw "Kimi search summary did not expose a clickable control"
    }
    & adb -s $script:deviceSerial shell input tap `
        $bounds.center_x $bounds.center_y | Out-Null
    Start-Sleep -Seconds 1
    $source = Get-PageSource -SessionId $SessionId
    if (-not (Test-KimiSearchPanel -Source $source)) {
        throw "Kimi search results panel did not open"
    }
    $source
}

function Move-ToKimiSearchPanelTop {
    param([Parameter(Mandatory)][string]$SessionId)

    $source = Get-PageSource -SessionId $SessionId
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $before = Get-KimiSearchViewportSignature -Source $source
        Invoke-KimiSearchPanelSwipe -Direction "down"
        $nextSource = Get-PageSource -SessionId $SessionId
        $after = Get-KimiSearchViewportSignature -Source $nextSource
        $source = $nextSource
        if ($after -and $after -eq $before) {
            break
        }
    }
    $source
}

function Find-KimiSearchCard {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Key
    )

    $source = Get-KimiPageSource -SessionId $SessionId
    $seenViewports = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::Ordinal
    )
    for ($viewport = 0; $viewport -lt 12; $viewport++) {
        $card = @(Get-KimiSearchCards -Source $source) |
            Where-Object { $_.key -eq $Key } |
            Select-Object -First 1
        if ($card) {
            return $card
        }
        $signature = Get-KimiSearchViewportSignature -Source $source
        if (-not $seenViewports.Add($signature)) {
            break
        }
        Invoke-KimiSearchPanelSwipe -Direction "up"
        $source = Get-KimiPageSource -SessionId $SessionId
    }
    $null
}

function Return-ToKimiSearchPanel {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -and $foregroundPackage -ne $packageName) {
            & adb -s $script:deviceSerial shell am force-stop `
                $foregroundPackage | Out-Null
            Start-Sleep -Milliseconds 700
            continue
        }
        try {
            $source = Get-KimiPageSource -SessionId $SessionId
        } catch {
            Press-Back -SessionId $SessionId
            Start-Sleep -Milliseconds 700
            continue
        }
        if (Test-KimiSearchPanel -Source $source) {
            return
        }
        Press-Back -SessionId $SessionId
        Start-Sleep -Milliseconds 700
    }
    throw "Could not return Kimi to the search results after collecting a source"
}

function Resolve-KimiSourceUrl {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)]$Record,
        [Parameter(Mandatory)]$Bounds
    )

    Write-GatewayTrace "kimi source $($Record.index) open"
    try {
        & adb -s $script:deviceSerial shell input tap `
            $Bounds.center_x $Bounds.center_y | Out-Null
        Start-Sleep -Seconds 2

        $pageSource = Get-KimiPageSource -SessionId $SessionId
        $visibleUrls = @(Get-UrlsFromText -Text $pageSource)
        $rawUrl = $visibleUrls | Select-Object -First 1
        if (-not $rawUrl) {
            $foregroundPackage = Get-ForegroundPackage
            if ($foregroundPackage -and $foregroundPackage -ne $packageName) {
                $rawUrl = Get-ResolverUrl
            } elseif ($pageSource) {
                $pageDocument = ConvertTo-Xml -Source $pageSource
                $shareNode = $pageDocument.SelectSingleNode(
                    "//*[@content-desc='titleImage']"
                )
                $shareBounds = if ($shareNode) {
                    Get-Bounds -Node $shareNode
                } else {
                    $null
                }
                if (-not $shareBounds) {
                    throw "Kimi source page did not expose its share control"
                }
                & adb -s $script:deviceSerial shell input tap `
                    $shareBounds.center_x $shareBounds.center_y | Out-Null
                Start-Sleep -Seconds 1
                $shareDocument = ConvertTo-Xml -Source (
                    Get-KimiPageSource -SessionId $SessionId
                )
                $copyNode = $shareDocument.SelectSingleNode(
                    "//*[@text='复制链接' or @content-desc='复制链接']"
                )
                while (
                    $copyNode -and
                    $copyNode.GetAttribute("clickable") -ne "true"
                ) {
                    $copyNode = $copyNode.ParentNode
                }
                $copyBounds = if ($copyNode) {
                    Get-Bounds -Node $copyNode
                } else {
                    $null
                }
                if (-not $copyBounds) {
                    throw "Kimi share sheet did not expose Copy Link"
                }
                & adb -s $script:deviceSerial shell input tap `
                    $copyBounds.center_x $copyBounds.center_y | Out-Null
                Start-Sleep -Milliseconds 700
                $rawUrl = Get-ClipboardText -SessionId $SessionId
            }
        }
        if (
            [string]::IsNullOrWhiteSpace([string]$rawUrl) -or
            [string]$rawUrl -notmatch '^https?://'
        ) {
            throw "Kimi source page did not expose an HTTP URL"
        }
        $canonicalUrl = ConvertTo-CanonicalUrl -Url $rawUrl
        $Record.url = $canonicalUrl
        $Record.raw_url = $rawUrl
        $Record.domain = Get-Host -Url $canonicalUrl
        $Record.url_resolution = "exact"
        $Record.status = "collected"
        $Record.error_message = $null
        Write-GatewayTrace "kimi source $($Record.index) resolved $canonicalUrl"
    } catch {
        $Record.status = "failed"
        $Record.error_message = $_.Exception.Message
        Write-GatewayTrace "kimi source $($Record.index) failed $($Record.error_message)"
    } finally {
        Return-ToKimiSearchPanel -SessionId $SessionId
    }
}

function Get-KimiSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    if ($ReferenceCount -lt 1) {
        return @()
    }
    $Source = Open-KimiSearchPanel -SessionId $SessionId
    $Source = Move-ToKimiSearchPanelTop -SessionId $SessionId
    $catalog = [Collections.Generic.List[object]]::new()
    $seenCards = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::Ordinal
    )
    $seenViewports = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::Ordinal
    )
    $stalls = 0
    for ($viewport = 0; $viewport -lt 12; $viewport++) {
        $signature = Get-KimiSearchViewportSignature -Source $Source
        $foundNew = $false
        foreach ($card in @(Get-KimiSearchCards -Source $Source)) {
            if ($seenCards.Add($card.key)) {
                $catalog.Add($card)
                $foundNew = $true
            }
        }
        if ($ReferenceCount -gt 0 -and $catalog.Count -ge $ReferenceCount) {
            break
        }
        if (-not $seenViewports.Add($signature)) {
            break
        }
        if ($foundNew) {
            $stalls = 0
        } else {
            $stalls++
        }
        if ($stalls -ge 2) {
            break
        }
        Invoke-KimiSearchPanelSwipe -Direction "up"
        $Source = Get-PageSource -SessionId $SessionId
    }
    Write-GatewayTrace "kimi search catalog count=$($catalog.Count)"

    $records = [Collections.Generic.List[object]]::new()
    $null = Move-ToKimiSearchPanelTop -SessionId $SessionId
    foreach ($catalogItem in $catalog) {
        $record = New-SourceRecord `
            -Index ($records.Count + 1) `
            -Title $catalogItem.title `
            -SiteName $catalogItem.site_name `
            -Domain $null `
            -Url $null `
            -Resolution "unavailable" `
            -Status "failed" `
            -ErrorMessage "Kimi source URL was not resolved"
        $records.Add($record)
        $card = Find-KimiSearchCard `
            -SessionId $SessionId `
            -Key $catalogItem.key
        if (-not $card) {
            $null = Move-ToKimiSearchPanelTop -SessionId $SessionId
            $card = Find-KimiSearchCard `
                -SessionId $SessionId `
                -Key $catalogItem.key
            if (-not $card) {
                $record.error_message = "Kimi search result card could not be reopened"
                continue
            }
        }
        Resolve-KimiSourceUrl `
            -SessionId $SessionId `
            -Record $record `
            -Bounds $card.bounds
    }
    while ($records.Count -lt $ReferenceCount) {
        $records.Add((New-SourceRecord `
            -Index ($records.Count + 1) `
            -Title $null `
            -SiteName $null `
            -Domain $null `
            -Url $null `
            -Resolution "unavailable" `
            -Status "failed" `
            -ErrorMessage "Kimi reported a source that was not exposed in the search panel"))
    }
    @($records)
}

$sessionId = $null
$appiumSessionClosed = $false
try {
    if (-not $task.id) {
        throw "Task JSON must include id"
    }
    $traceTaskId = ([string]$task.id) -replace "[^a-zA-Z0-9_-]", "_"
    $script:tracePath = Join-Path $resultRoot "$traceTaskId-trace.log"
    Write-GatewayTrace "task start"
    $prompt = [string]$task.payload.prompt
    if ([string]::IsNullOrWhiteSpace($prompt)) {
        throw "Task payload.prompt must be non-empty"
    }
    $timeoutSeconds = 240
    if ($null -ne $task.payload.timeout_seconds) {
        $timeoutSeconds = [int]$task.payload.timeout_seconds
    }
    if ($timeoutSeconds -lt 30 -or $timeoutSeconds -gt 600) {
        throw "Task payload.timeout_seconds must be between 30 and 600"
    }

    $devices = @(Get-AdbDevices)
    if ($devices.Count -eq 0) {
        throw "No authorized Android device is connected"
    }
    $serial = if ($task.payload.device_serial) {
        [string]$task.payload.device_serial
    } else {
        $devices[0]
    }
    if ($serial -notin $devices) {
        throw "Requested Android device is not connected: $serial"
    }
    $script:deviceSerial = $serial
    Ensure-AndroidDeviceUnlocked -SessionId "adb"
    $systemPort = if ($null -ne $task.payload.appium_system_port) {
        [int]$task.payload.appium_system_port
    } else {
        8200
    }
    $mjpegServerPort = if ($null -ne $task.payload.appium_mjpeg_server_port) {
        [int]$task.payload.appium_mjpeg_server_port
    } else {
        9200
    }
    $script:systemPort = $systemPort
    $script:mjpegServerPort = $mjpegServerPort

    $startedAt = Get-Date
    if ($Platform -in @("yuanbao", "qwen", "kimi")) {
        $sessionId = "adb"
        # Rebuild the activity stack on every attempt. Source browsers and
        # share sheets from a failed attempt otherwise poison all retries.
        & adb -s $serial shell am force-stop $packageName | Out-Null
        & cmd.exe /d /c (
            "adb -s $serial shell monkey -p $packageName " +
            "-c android.intent.category.LAUNCHER 1 >nul 2>&1"
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Could not activate $Platform"
        }
    } else {
        $sessionId = New-AppiumSession `
            -Serial $serial `
            -SystemPort $systemPort `
            -MjpegServerPort $mjpegServerPort `
            -CommandTimeoutSeconds ($timeoutSeconds + 180)
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$sessionId/execute/sync" `
            -Body @{
                script = "mobile: activateApp"
                args = @(@{ appId = $packageName })
            } | Out-Null
        if ($Platform -eq "deepseek") {
            # DeepSeek may restore its embedded source-browser activity from
            # the previous task. Rebuild only the activity stack; no app data
            # or authenticated state is cleared.
            & adb -s $serial shell am force-stop $packageName | Out-Null
            Start-DeepSeekApp -Serial $serial
            Start-Sleep -Seconds 1
        }
    }
    Start-Sleep -Seconds 2
    if ($sessionId -eq "adb") {
        Dismiss-HuaweiTouchProtection -SessionId $sessionId
    }

    $newConversation = $true
    if ($null -ne $task.payload.new_conversation) {
        $newConversation = [bool]$task.payload.new_conversation
    }
    if ($newConversation) {
        Start-NewConversation -SessionId $sessionId
    }
    Write-GatewayTrace "conversation ready"

    Submit-Prompt -SessionId $sessionId -Prompt $prompt
    Write-GatewayTrace "prompt submitted"
    $sentAt = Get-Date
    if ($Platform -eq "deepseek") {
        # Native hierarchy dumps conflict with UiAutomator2's accessibility
        # instrumentation on DeepSeek Compose views. Appium is only needed to
        # enter the conversation and is released before capture begins.
        $deepSeekAppiumSession = $sessionId
        & adb -s $serial shell am force-stop `
            io.appium.uiautomator2.server.test | Out-Null
        & adb -s $serial shell am force-stop `
            io.appium.uiautomator2.server | Out-Null
        try {
            Invoke-AppiumRequest `
                -Method Delete `
                -Path "/session/$deepSeekAppiumSession" `
                -Body $null `
                -TimeoutSeconds 8 | Out-Null
        } catch {
            Write-GatewayTrace "Appium session cleanup skipped: $($_.Exception.Message)"
        }
        $appiumSessionClosed = $true
        $sessionId = "adb"
        Resume-DeepSeekApp -Serial $serial
        Start-Sleep -Seconds 20
    } elseif ($Platform -eq "yuanbao") {
        # Yuanbao pauses while loading product cards. Accessibility dumps
        # during that pause can freeze Compose and make a partial answer look
        # stable, so leave generation entirely undisturbed first.
        Start-Sleep -Seconds 75
    }
    $answerInfo = Wait-ForAnswer `
        -SessionId $sessionId `
        -Prompt $prompt `
        -TimeoutSeconds $timeoutSeconds
    Write-GatewayTrace "answer complete references=$($answerInfo.reference_count)"
    $answerCompletedAt = Get-Date

    $sourceCollectionStartedAt = Get-Date
    $panelCollection = $null
    $sources = switch ($Platform) {
        "deepseek" {
            @(Get-DeepSeekSources `
                -SessionId $sessionId `
                -ReferenceCount $answerInfo.reference_count)
        }
        { $_ -in @("yuanbao", "qwen") } {
            $panelCollection = Get-PanelSources `
                -SessionId $sessionId `
                -ReferenceCount $answerInfo.reference_count
            @($panelCollection.sources)
        }
        "kimi" {
            @(Get-KimiSources `
                -SessionId $sessionId `
                -ReferenceCount $answerInfo.reference_count)
        }
    }
    $sourceCollectionCompletedAt = Get-Date
    Write-GatewayTrace "sources complete count=$(@($sources).Count)"
    if ($Platform -in @("yuanbao", "qwen") -and $panelCollection) {
        $answerInfo.reference_count = [int]$panelCollection.reference_count
    } elseif ($Platform -eq "kimi") {
        $answerInfo.reference_count = [math]::Max(
            [int]$answerInfo.reference_count,
            @($sources).Count
        )
    }
    if (
        $answerInfo.reference_count -gt 0 -and
        @($sources).Count -ne [int]$answerInfo.reference_count
    ) {
        throw (
            "$Platform source collection incomplete: expected {0}, collected {1}" -f
                $answerInfo.reference_count,
                @($sources).Count
        )
    }

    $answerUrls = @(Get-UrlsFromText -Text $answerInfo.answer)
    $safeTaskId = ([string]$task.id) -replace "[^a-zA-Z0-9_-]", "_"
    $taskResultDirectory = Join-Path $resultRoot $safeTaskId
    New-Item -ItemType Directory -Path $taskResultDirectory -Force | Out-Null
    $sourcePath = Join-Path $taskResultDirectory "source.xml"
    [IO.File]::WriteAllText(
        $sourcePath,
        [string]$answerInfo.source,
        [Text.UTF8Encoding]::new($true)
    )
    $screenshotPath = Join-Path $taskResultDirectory "screenshot.png"
    if ($Platform -in @("deepseek", "yuanbao", "qwen", "kimi")) {
        $deviceScreenshot = "/sdcard/$safeTaskId-screenshot.png"
        try {
            & adb -s $script:deviceSerial shell screencap -p $deviceScreenshot | Out-Null
            Copy-AdbFile `
                -DevicePath $deviceScreenshot `
                -LocalPath $screenshotPath
        } finally {
            & adb -s $script:deviceSerial shell rm -f $deviceScreenshot | Out-Null
        }
    } else {
        $screenshotResponse = Invoke-AppiumRequest `
            -Method Get `
            -Path "/session/$sessionId/screenshot" `
            -Body $null
        [IO.File]::WriteAllBytes(
            $screenshotPath,
            [Convert]::FromBase64String([string]$screenshotResponse.value)
        )
    }

    $sourceRecords = @($sources)
    $sourceSuccessCount = @($sourceRecords | Where-Object {
        $_.status -eq "collected" -and $_.url
    }).Count
    $sourceFailureCount = [math]::Max(
        $sourceRecords.Count - $sourceSuccessCount,
        [int]$answerInfo.reference_count - $sourceSuccessCount
    )
    $sourceCompleteness = if ($answerInfo.reference_count -gt 0) {
        [math]::Round(
            $sourceSuccessCount / [double]$answerInfo.reference_count,
            4
        )
    } else {
        1.0
    }
    $captureStatus = if ($sourceCompleteness -ge 1) {
        "complete"
    } elseif ($sourceSuccessCount -gt 0) {
        "partial"
    } else {
        "answer_only"
    }
    $completedAt = Get-Date
    [pscustomobject][ordered]@{
        platform = $Platform
        surface = "app"
        package_name = $packageName
        app_version = Get-AppVersion -Package $packageName
        device_serial = $serial
        prompt = $prompt
        answer = $answerInfo.answer
        answer_urls = $answerUrls
        reference_count = [int]$answerInfo.reference_count
        source_count = $sourceRecords.Count
        source_success_count = $sourceSuccessCount
        source_failure_count = $sourceFailureCount
        source_completeness = $sourceCompleteness
        capture_status = $captureStatus
        sources = $sourceRecords
        started_at = $startedAt.ToString("o")
        sent_at = $sentAt.ToString("o")
        first_token_at = if ($answerInfo.first_token_at) {
            $answerInfo.first_token_at.ToString("o")
        } else {
            $null
        }
        answer_completed_at = $answerCompletedAt.ToString("o")
        completed_at = $completedAt.ToString("o")
        response_latency_ms = [math]::Round(
            ($answerCompletedAt - $sentAt).TotalMilliseconds
        )
        source_collection_duration_ms = [math]::Round(
            ($sourceCollectionCompletedAt - $sourceCollectionStartedAt).
                TotalMilliseconds
        )
        duration_ms = [math]::Round(
            ($completedAt - $startedAt).TotalMilliseconds
        )
        source_path = $sourcePath
        screenshot_path = $screenshotPath
    } | ConvertTo-Json -Depth 30 -Compress
} finally {
    if ($sessionId -and $sessionId -ne "adb" -and -not $appiumSessionClosed) {
        try {
            Invoke-AppiumRequest `
                -Method Delete `
                -Path "/session/$sessionId" `
                -Body $null | Out-Null
        } catch {}
    }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
