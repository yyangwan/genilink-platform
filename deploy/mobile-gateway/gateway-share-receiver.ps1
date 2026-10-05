$script:shareReceiverPackage = "com.genilink.citationreceiver"
$script:shareReceiverLabel = "Genilink Citation Capture"

function Test-ShareReceiverAllowed {
    param([Parameter(Mandatory)][string]$Serial)

    $allowed = @($env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIALS -split ',' |
        ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($allowed.Count -eq 0 -and $env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL) {
        $allowed = @($env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL)
    }
    return @($allowed | Where-Object {
        [string]::Equals($_, $Serial, [StringComparison]::Ordinal)
    }).Count -eq 1
}

function Test-ShareReceiverEnabled {
    param([Parameter(Mandatory)][string]$Serial)

    if (-not (Test-ShareReceiverAllowed -Serial $Serial)) { return $false }
    $packages = & adb -s $Serial shell pm list packages $script:shareReceiverPackage
    return $LASTEXITCODE -eq 0 -and
        @($packages | Where-Object { $_.Trim() -eq "package:$script:shareReceiverPackage" }).Count -eq 1
}

function Start-ShareReceiverCapture {
    param([Parameter(Mandatory)][string]$Serial)

    if (-not (Test-ShareReceiverEnabled -Serial $Serial)) {
        throw "Share receiver is not enabled on this device"
    }
    $nonce = [guid]::NewGuid().ToString("N")
    $started = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    & adb -s $Serial shell am broadcast -f 0x20 `
        -n "$script:shareReceiverPackage/.ArmReceiver" `
        -a "$script:shareReceiverPackage.ARM" --es nonce $nonce | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not arm share receiver" }
    [pscustomobject]@{ nonce = $nonce; started_at_ms = $started }
}

function Receive-ShareReceiverCapture {
    param(
        [Parameter(Mandatory)][string]$Serial,
        [Parameter(Mandatory)]$Request,
        [int]$TimeoutSeconds = 8
    )

    $uri = "content://$($script:shareReceiverPackage).capture/$($Request.nonce)"
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $rows = & adb -s $Serial shell content query --uri $uri 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { throw "Share receiver query failed: $rows" }
        if ($rows -match 'payload=([A-Za-z0-9+/=]+)') {
            $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[1]))
            $result = $json | ConvertFrom-Json
            if ($result.nonce -ne $Request.nonce -or
                [long]$result.captured_at_ms -lt [long]$Request.started_at_ms) {
                throw "Share receiver returned stale or unrelated data"
            }
            return $result
        }
        Start-Sleep -Milliseconds 350
    }
    throw "Share receiver did not receive a fresh share"
}

function Get-SharedHttpUrl {
    param([Parameter(Mandatory)]$Capture)

    $candidates = @($Capture.text, $Capture.html_text) + @($Capture.clip_texts)
    $urls = @()
    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        foreach ($match in [regex]::Matches([string]$candidate, 'https?://[^\s<>"''\u3000]+')) {
            $url = $match.Value.TrimEnd('.', ',', ';', ')', ']', '"')
            $uri = $null
            if ([Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -and
                $uri.Scheme -in @("http", "https") -and $uri.Host) {
                $urls += $url
            }
        }
    }
    $unique = @($urls | Select-Object -Unique)
    if ($unique.Count -ne 1) {
        throw "Share payload did not contain exactly one HTTP source URL"
    }
    return $unique[0]
}

function Get-ChooserHttpUrl {
    param([Parameter(Mandatory)]$Document)

    $urls = @($Document.SelectNodes(
        "//*[@package='com.huawei.android.internal.app' or @package='com.android.intentresolver']"
    ) | ForEach-Object { $_.GetAttribute("text") } |
        Where-Object {
            $uri = $null
            [Uri]::TryCreate($_, [UriKind]::Absolute, [ref]$uri) -and
                $uri.Scheme -in @("http", "https") -and $uri.Host
        } | Select-Object -Unique)
    if ($urls.Count -eq 1) { return $urls[0] }
    $null
}

function Get-AppiumUtf8PageSource {
    param([Parameter(Mandatory)][string]$SessionId)

    $response = Invoke-WebRequest -Method Get -UseBasicParsing `
        -Uri "http://127.0.0.1:4723/session/$SessionId/source" -TimeoutSec 30
    $reader = New-Object IO.StreamReader($response.RawContentStream, [Text.Encoding]::UTF8)
    try {
        $payload = $reader.ReadToEnd() | ConvertFrom-Json
        return [string]$payload.value
    } finally {
        $reader.Dispose()
    }
}

function New-ShareReceiverAppiumSession {
    param([Parameter(Mandatory)][string]$Serial)

    $systemPort = if ($script:systemPort) { [int]$script:systemPort } else { 8299 }
    $mjpegPort = if ($script:mjpegServerPort) { [int]$script:mjpegServerPort } else { 9299 }
    $body = @{
        capabilities = @{
            alwaysMatch = @{
                platformName = "Android"
                "appium:automationName" = "UiAutomator2"
                "appium:deviceName" = $Serial
                "appium:udid" = $Serial
                "appium:noReset" = $true
                "appium:newCommandTimeout" = 420
                "appium:skipDeviceInitialization" = $true
                "appium:skipServerInstallation" = $true
                "appium:systemPort" = $systemPort
                "appium:mjpegServerPort" = $mjpegPort
            }
            firstMatch = @(@{})
        }
    } | ConvertTo-Json -Depth 8 -Compress
    $response = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4723/session" `
        -Body $body -ContentType "application/json" -TimeoutSec 60
    $id = [string]$response.value.sessionId
    if (-not $id) { throw "Appium did not return a share fallback session ID" }
    return $id
}

function Invoke-ShareReceiverOnOpenSheet {
    param(
        [Parameter(Mandatory)][string]$Serial,
        [Parameter(Mandatory)][string]$SessionId,
        [string]$Platform
    )

    $ownSession = $SessionId -eq "adb"
    if ($ownSession) {
        $SessionId = New-ShareReceiverAppiumSession -Serial $Serial
    }
    $settingsUrl = "http://127.0.0.1:4723/session/$SessionId/appium/settings"
    try {
        Invoke-RestMethod -Method Post -Uri $settingsUrl `
            -Body '{"settings":{"enableMultiWindows":true}}' `
            -ContentType "application/json" -TimeoutSec 30 | Out-Null
        $pageSource = { Get-AppiumUtf8PageSource -SessionId $SessionId }
        $source = & $pageSource
        [xml]$document = $source
        $chooserUrl = Get-ChooserHttpUrl -Document $document
        if ($chooserUrl) {
            & adb -s $Serial shell input keyevent 4 | Out-Null
            return $chooserUrl
        }
        $request = Start-ShareReceiverCapture -Serial $Serial
        $chooserUrl = Select-ShareReceiverTarget `
            -Serial $Serial `
            -PageSource $pageSource `
            -Platform $Platform
        if ($chooserUrl) { return $chooserUrl }
        $capture = Receive-ShareReceiverCapture -Serial $Serial -Request $request
        Get-SharedHttpUrl -Capture $capture
    } finally {
        if ($ownSession) {
            try {
                Invoke-RestMethod -Method Delete `
                    -Uri "http://127.0.0.1:4723/session/$SessionId" `
                    -TimeoutSec 30 | Out-Null
            } catch {}
        } else {
            Invoke-RestMethod -Method Post -Uri $settingsUrl `
                -Body '{"settings":{"enableMultiWindows":false}}' `
                -ContentType "application/json" -TimeoutSec 30 | Out-Null
        }
    }
}

function Select-ShareReceiverTarget {
    param(
        [Parameter(Mandatory)][string]$Serial,
        [Parameter(Mandatory)][scriptblock]$PageSource,
        [string]$Platform
    )

    $kimiMoreTapped = $false
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        [xml]$document = & $PageSource
        $chooserUrl = Get-ChooserHttpUrl -Document $document
        if ($chooserUrl) {
            & adb -s $Serial shell input keyevent 4 | Out-Null
            return $chooserUrl
        }
        $target = @($document.SelectNodes("//*[@text='$script:shareReceiverLabel' or @content-desc='$script:shareReceiverLabel']")) |
            Select-Object -First 1
        if (-not $target) {
            $target = @($document.SelectNodes(
                "//*[@text='更多' or @text='其他' or @text='全部' or @text='More' or @text='All' or @content-desc='更多']"
            )) | Select-Object -First 1
            if (-not $target) {
                if ($Platform -eq "kimi" -and -not $kimiMoreTapped -and
                    @($document.SelectNodes("//*[@package='com.moonshot.kimichat']")).Count -gt 0) {
                    $size = (& adb -s $Serial shell wm size | Out-String)
                    $dimensions = @([regex]::Matches($size, '(\d+)x(\d+)')) |
                        Select-Object -Last 1
                    if ($LASTEXITCODE -ne 0 -or -not $dimensions) {
                        throw "Could not determine Kimi share sheet size"
                    }
                    $x = [int]([int]$dimensions.Groups[1].Value * 0.604)
                    $y = [int]([int]$dimensions.Groups[2].Value * 0.922)
                    & adb -s $Serial shell input tap $x $y | Out-Null
                    if ($LASTEXITCODE -ne 0) { throw "Could not open Kimi system chooser" }
                    $kimiMoreTapped = $true
                }
                Start-Sleep -Milliseconds 500
                continue
            }
        }
        $selectedLabel = $target.GetAttribute("text") -eq $script:shareReceiverLabel -or
            $target.GetAttribute("content-desc") -eq $script:shareReceiverLabel
        while ($target -and ($target.GetAttribute("clickable") -ne "true" -or
            $target.GetAttribute("bounds") -eq "[0,0][0,0]")) {
            $target = $target.ParentNode
        }
        if (-not $target) { throw "Share chooser target has no tappable ancestor" }
        $boundsText = $target.GetAttribute("bounds")
        if ($boundsText -match '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') {
            $x = ([int]$Matches[1] + [int]$Matches[3]) / 2
            $y = ([int]$Matches[2] + [int]$Matches[4]) / 2
            & adb -s $Serial shell input tap ([int]$x) ([int]$y) | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not select share receiver" }
            if ($selectedLabel) {
                return
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Share receiver target not visible in chooser"
}
