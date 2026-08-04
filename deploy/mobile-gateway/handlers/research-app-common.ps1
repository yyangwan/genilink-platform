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
        version = "3.0.4"
    }
}
$packageName = [string]$platformConfig[$Platform].package
$mutex = [Threading.Mutex]::new($false, "Global\MobileGateway-Android-Device")

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

    if ($Platform -in @("deepseek", "yuanbao") -and $script:deviceSerial) {
        # Appium's source endpoint wedges on Compose answer views.
        # Android's native dumper returns the same accessibility hierarchy.
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

function Get-ClipboardText {
    param([Parameter(Mandatory)][string]$SessionId)

    if ($Platform -in @("deepseek", "yuanbao") -and $script:deviceSerial) {
        if ($Platform -eq "deepseek") {
            # Appium session cleanup leaves the Settings helper stopped, so
            # its explicit clipboard receiver otherwise returns result=0.
            & adb -s $script:deviceSerial shell am start -n `
                io.appium.settings/.Settings | Out-Null
            Start-Sleep -Milliseconds 400
        }
        $previousIme = (
            & adb -s $script:deviceSerial shell settings get secure default_input_method
        ).Trim()
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
                & adb -s $script:deviceSerial shell monkey `
                    -p $packageName 1 | Out-Null
                Start-Sleep -Milliseconds 400
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
        $sourceNode = $document.SelectSingleNode(
            "//*[@text='源' or @content-desc='源']"
        )
        $copyBounds = if ($copyNode) { Get-Bounds -Node $copyNode } else { $null }
        $sourceBounds = if ($sourceNode) { Get-Bounds -Node $sourceNode } else { $null }
        if ($copyBounds -and $sourceBounds) {
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

function ConvertTo-ImapUtf7 {
    param([Parameter(Mandatory)][string]$Text)

    $escaped = $Text.Replace("&", "&-")
    [regex]::Replace($escaped, '[^\x20-\x7e]+', {
        param($Match)

        $chunk = $Match.Value
        $bytes = [byte[]]::new($chunk.Length * 2)
        for ($index = 0; $index -lt $chunk.Length; $index++) {
            $code = [int][char]$chunk[$index]
            $bytes[$index * 2] = [byte]($code -shr 8)
            $bytes[$index * 2 + 1] = [byte]($code -band 0xff)
        }
        $encoded = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('/', ',')
        "&$encoded-"
    })
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
    foreach ($line in $dump) {
        if ($line -match "dat=(https?://[^\s}]+)") {
            return [string]$Matches[1]
        }
    }
    $null
}

function Get-ExternalUrlHandlerPackage {
    foreach ($line in @(
        & adb -s $script:deviceSerial shell dumpsys activity activities
    )) {
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
            # Huawei's share sheet blocks page-source requests and ignores the
            # Android back key. This is the observed Yuanbao Cancel button.
            & adb -s $script:deviceSerial shell input tap 1068 1648 | Out-Null
            Start-Sleep -Milliseconds 700
            # Always create an empty conversation through Yuanbao's drawer.
            & adb -s $script:deviceSerial shell input tap 100 190 | Out-Null
            Start-Sleep -Milliseconds 700
            & adb -s $script:deviceSerial shell input tap 440 400 | Out-Null
            Start-Sleep -Seconds 1
            $conversationReady = $false
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                $source = Get-PageSource -SessionId $SessionId
                if ($source -match 'resource-id="[^"]*:id/edConversationInput"') {
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
            Click-Point -SessionId $SessionId -X 90 -Y 200
            Start-Sleep -Seconds 1
            $button = Find-Element `
                -SessionId $SessionId `
                -Using "xpath" `
                -Value "//*[contains(@text,'新建') and contains(@text,'对话')]" `
                -TimeoutSeconds 3 `
                -Optional
            if ($button) {
                Click-Element -SessionId $SessionId -ElementId $button
            } else {
                Press-Back -SessionId $SessionId
            }
        }
        "kimi" {
            $button = Find-Element `
                -SessionId $SessionId `
                -Using "xpath" `
                -Value "//*[@content-desc='开启新会话']" `
                -TimeoutSeconds 5 `
                -Optional
            if ($button) {
                Click-Element -SessionId $SessionId -ElementId $button
            } else {
                Click-Point -SessionId $SessionId -X 918 -Y 186
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
            $input = Find-Element `
                -SessionId $SessionId `
                -Using "class name" `
                -Value "android.widget.EditText" `
                -TimeoutSeconds 3 `
                -Optional
            if (-not $input) {
                Click-Point -SessionId $SessionId -X 520 -Y 2190
                Start-Sleep -Seconds 1
                $input = Find-Element `
                    -SessionId $SessionId `
                    -Using "class name" `
                    -Value "android.widget.EditText"
            }
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
        if ($Platform -eq "yuanbao") {
            # Yuanbao's input sits near the bottom of this 1152x2376 device.
            & adb -s $script:deviceSerial shell input tap 300 2100 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "ADB failed to focus the Yuanbao prompt input"
            }
        }
        Start-Sleep -Milliseconds 500
        $previousIme = (
            & adb -s $script:deviceSerial shell settings get secure default_input_method
        ).Trim()
        try {
            & adb -s $script:deviceSerial shell ime set io.appium.settings/.UnicodeIME | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not activate Appium UnicodeIME"
            }
            Start-Sleep -Seconds 1
            $encodedPrompt = ConvertTo-ImapUtf7 -Text $Prompt
            $quotedPrompt = "'$encodedPrompt'"
            & adb -s $script:deviceSerial shell input text $quotedPrompt | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not type the Yuanbao prompt"
            }
        } finally {
            if ($previousIme -and $previousIme -ne "null") {
                & adb -s $script:deviceSerial shell ime set $previousIme | Out-Null
                Start-Sleep -Milliseconds 500
            }
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
        $imeState = (
            & adb -s $script:deviceSerial shell dumpsys input_method 2>&1
        ) -join "`n"
        $sendY = if ($imeState -match 'mInputShown=true|mIsInputViewShown=true') {
            1430
        } else {
            2250
        }
        & adb -s $script:deviceSerial shell input tap 1030 $sendY | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap the DeepSeek send button"
        }
        return
    }
    if ($Platform -eq "yuanbao") {
        & adb -s $script:deviceSerial shell input tap 1025 2102 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "ADB failed to tap the Yuanbao send button"
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
        if ($height -lt 400) {
            continue
        }
        $hasLongText = $false
        foreach ($text in @(Get-DescendantTexts -Node $node)) {
            if ($text.Length -ge 60) {
                $hasLongText = $true
                break
            }
        }
        if ($hasLongText) {
            $candidates += [pscustomobject]@{
                node = $node
                height = $height
            }
        }
    }
    $selected = $candidates | Sort-Object height | Select-Object -First 1
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
            $answerParts = @(
                $document.SelectNodes("//*[@class='android.widget.TextView' and @text]") |
                    ForEach-Object { $_.GetAttribute("text").Trim() } |
                    Where-Object { $_ -ne $Prompt -and $_.Length -gt 30 } |
                    Sort-Object Length -Descending |
                    Select-Object -First 1
            )
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
                if ($text -eq $Prompt -or $text.Length -lt 60) {
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
        if ($Platform -eq "kimi") {
            $stableComplete = (
                $info.reference_count -gt 0 -and
                $stableCount -ge 1
            )
        }
        if ($info.answer -and ($explicitComplete -or $stableComplete)) {
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

    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        $source = Get-PageSource -SessionId $SessionId
        if ($source -match 'text="引用来源') {
            return
        }
        Press-Back -SessionId $SessionId
        Start-Sleep -Milliseconds 700
    }
    throw "Could not return to the Yuanbao source panel"
}

function Get-ForegroundPackage {
    $output = (
        & adb -s $script:deviceSerial shell timeout 5 dumpsys window windows
    ) -join "`n"
    if ($output -match 'mCurrentFocus=Window\{[^\r\n]*?\s([a-zA-Z0-9._]+)/') {
        return $Matches[1]
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
    try {
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
        Write-GatewayTrace "source $($Record.index) clipboard $rawUrl"
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
        $document = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
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
                    throw "Android resolver did not expose the source URL"
                }
                $url = ConvertTo-CanonicalUrl -Url $rawUrl
                $record.raw_url = $rawUrl
                $record.url = $url
                $record.domain = Get-Host -Url $url
                $record.url_resolution = "exact"
                $externalPackage = Get-ExternalUrlHandlerPackage
                if ($externalPackage) {
                    & adb -s $script:deviceSerial shell am force-stop `
                        $externalPackage | Out-Null
                    & adb -s $script:deviceSerial shell monkey `
                        -p $packageName 1 | Out-Null
                } else {
                    Press-Back -SessionId $SessionId
                }
                Start-Sleep -Milliseconds 500
                Return-ToDeepSeekSourcePanel -SessionId $SessionId
            } catch {
                $record.status = "failed"
                $record.error_message = $_.Exception.Message
                try {
                    & adb -s $script:deviceSerial shell monkey `
                        -p $packageName 1 | Out-Null
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

function Get-PanelSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    if ($Platform -eq "qwen" -and $ReferenceCount -lt 1) {
        return @()
    }
    if ($Platform -eq "yuanbao") {
        Write-GatewayTrace "source marker lookup"
        $answerDocument = ConvertTo-Xml -Source (Get-PageSource -SessionId $SessionId)
        $markerNode = $answerDocument.SelectSingleNode(
            "//*[@text='源' or @content-desc='源']"
        )
        $markerBounds = if ($markerNode) { Get-Bounds -Node $markerNode } else { $null }
        if (-not $markerBounds) {
            throw "Yuanbao source marker was not found"
        }
        & adb -s $script:deviceSerial shell input tap `
            $markerBounds.center_x $markerBounds.center_y | Out-Null
        Write-GatewayTrace "source panel opened"
    } else {
        $marker = Find-Element `
            -SessionId $SessionId `
            -Using "xpath" `
            -Value "//*[contains(@text,'参考了') and contains(@text,'篇资料')]"
        Click-Element -SessionId $SessionId -ElementId $marker
    }
    Start-Sleep -Seconds 1
    if ($ReferenceCount -lt 1) {
        $panelSource = Get-PageSource -SessionId $SessionId
        if ($panelSource -match "引用来源\s*(\d+)") {
            $ReferenceCount = [int]$Matches[1]
        }
    }
    if ($ReferenceCount -lt 1) {
        throw "$Platform source panel did not expose a reference count"
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
            }
            $collected[[string]$index] = $record
            $foundNew = $true
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
        if (-not $foundNew -and -not $didScroll) {
            $stalls++
        } else {
            Start-Sleep -Milliseconds 700
        }
    }
    @($collected.Values | Sort-Object index)
}

function Get-KimiSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string]$Source
    )

    $document = ConvertTo-Xml -Source $Source
    $answerContainer = Get-KimiAnswerContainer -Document $document
    if (-not $answerContainer) {
        return @()
    }
    $records = @()
    $ignoredSourceLabels = @(
        "快速",
        "进阶",
        "升级订阅",
        "思考已完成",
        "搜索网页",
        "内容由 AI 生成",
        "尽管问，带图也行"
    )
    foreach ($item in @(
        $answerContainer.SelectNodes(
            ".//*[@class='android.view.View' and @clickable='true']"
        )
    )) {
        $texts = @(Get-DescendantTexts -Node $item)
        $bounds = Get-Bounds -Node $item
        if (
            $texts.Count -ne 1 -or
            -not $bounds -or
            ($bounds.bottom - $bounds.top) -gt 170
        ) {
            continue
        }
        $siteName = $texts[0]
        if (
            $siteName.Length -gt 40 -or
            $siteName -in $ignoredSourceLabels
        ) {
            continue
        }
        $records += New-SourceRecord `
            -Index ($records.Count + 1) `
            -Title $null `
            -SiteName $siteName `
            -Domain $null `
            -Url $null `
            -Resolution "unavailable"
    }
    @($records)
}

$sessionId = $null
$appiumSessionClosed = $false
try {
    $task = $TaskJson | ConvertFrom-Json
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

    $startedAt = Get-Date
    if ($Platform -eq "yuanbao") {
        $sessionId = "adb"
        & adb -s $serial shell am start `
            -n "$packageName/.biz.login.v2.HYLoginMainActivity" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not activate Yuanbao"
        }
    } else {
        $capabilities = @{
            capabilities = @{
                alwaysMatch = @{
                    platformName = "Android"
                    "appium:automationName" = "UiAutomator2"
                    "appium:deviceName" = $serial
                    "appium:udid" = $serial
                    "appium:noReset" = $true
                    "appium:newCommandTimeout" = $timeoutSeconds + 180
                    "appium:skipDeviceInitialization" = $true
                    "appium:skipServerInstallation" = $true
                }
                firstMatch = @(@{})
            }
        }
        $session = Invoke-AppiumRequest `
            -Method Post `
            -Path "/session" `
            -Body $capabilities `
            -TimeoutSeconds 60
        $sessionId = [string]$session.value.sessionId
        if (-not $sessionId) {
            throw "Appium did not return a session ID"
        }
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$sessionId/execute/sync" `
            -Body @{
                script = "mobile: activateApp"
                args = @(@{ appId = $packageName })
            } | Out-Null
    }
    Start-Sleep -Seconds 2

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
    $sources = switch ($Platform) {
        "deepseek" {
            @(Get-DeepSeekSources `
                -SessionId $sessionId `
                -ReferenceCount $answerInfo.reference_count)
        }
        { $_ -in @("yuanbao", "qwen") } {
            @(Get-PanelSources `
                -SessionId $sessionId `
                -ReferenceCount $answerInfo.reference_count)
        }
        "kimi" {
            @(Get-KimiSources `
                -SessionId $sessionId `
                -Source $answerInfo.source)
        }
    }
    $sourceCollectionCompletedAt = Get-Date
    Write-GatewayTrace "sources complete count=$(@($sources).Count)"
    if ($Platform -eq "yuanbao" -and $answerInfo.reference_count -lt 1) {
        $answerInfo.reference_count = @($sources).Count
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
    if ($Platform -in @("deepseek", "yuanbao")) {
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
        source_count = @($sources).Count
        sources = @($sources)
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
