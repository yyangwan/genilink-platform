param(
    [Parameter(Mandatory)]
    [string]$TaskJson
)

$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path $PSScriptRoot -Parent) "gateway-share-receiver.ps1")
. (Join-Path (Split-Path $PSScriptRoot -Parent) "gateway-capture-verifier.ps1")
$appiumBaseUrl = "http://127.0.0.1:4723"
$packageName = "com.larus.nova"
$elementKey = "element-6066-11e4-a52e-4f735466cecf"
$resultRoot = "C:\ProgramData\MobileGateway\results"
$doubaoRetryMessage = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String(
        "5Ye65LqG54K56Zeu6aKY77yM6K+356iN5ZCO6YeN6K+V44CC"
    )
)
$copyLinkLabel = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String("5aSN5Yi26ZO+5o6l")
)
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

function Invoke-AppiumRequest {
    param(
        [Parameter(Mandatory)]
        [string]$Method,
        [Parameter(Mandatory)]
        [string]$Path,
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
        $request.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    Invoke-RestMethod @request
}

function Find-AppiumElement {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$ResourceId,
        [int]$TimeoutSeconds = 10,
        [switch]$Optional
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-AppiumRequest `
                -Method Post `
                -Path "/session/$SessionId/element" `
                -Body @{ using = "id"; value = $ResourceId }
            $elementId = $response.value.$elementKey
            if ($elementId) {
                return $elementId
            }
        } catch {
            if ((Get-Date) -ge $deadline) {
                if ($Optional) {
                    return $null
                }
                throw
            }
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    if ($Optional) {
        return $null
    }
    throw "Element not found: $ResourceId"
}

function Find-AppiumElementByXPath {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$XPath,
        [switch]$Optional
    )

    try {
        $response = Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$SessionId/element" `
            -Body @{ using = "xpath"; value = $XPath }
        $elementId = $response.value.$elementKey
        if ($elementId) {
            return $elementId
        }
    } catch {
        if (-not $Optional) {
            throw
        }
    }
    if ($Optional) {
        return $null
    }
    throw "Element not found: $XPath"
}

function Invoke-ElementClick {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$ElementId
    )

    $response = Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$SessionId/element/$ElementId/rect" `
        -Body $null
    $rect = $response.value
    if ($null -eq $rect -or $rect.width -lt 1 -or $rect.height -lt 1) {
        throw "Could not determine the element bounds"
    }
    $centerX = [int]($rect.x + ($rect.width / 2))
    $centerY = [int]($rect.y + ($rect.height / 2))
    & adb -s $script:deviceSerial shell input tap $centerX $centerY | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "ADB failed to tap the Doubao element"
    }
}

function Get-PageSource {
    param([Parameter(Mandatory)][string]$SessionId)

    $response = Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$SessionId/source" `
        -Body $null `
        -TimeoutSeconds 45
    [string]$response.value
}

function Get-NativePageSource {
    $devicePath = "/sdcard/mobile-gateway-doubao.xml"
    $localPath = Join-Path $resultRoot "$($script:taskWorkingPrefix)-doubao-current.xml"
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        & adb -s $script:deviceSerial shell rm -f $devicePath | Out-Null
        Remove-Item -LiteralPath $localPath -Force -ErrorAction SilentlyContinue
        $dumpProcess = Start-Process `
            -FilePath "adb" `
            -ArgumentList @("-s", $script:deviceSerial, "shell", "uiautomator", "dump", $devicePath) `
            -WindowStyle Hidden `
            -PassThru
        if (-not $dumpProcess.WaitForExit(15000)) {
            $dumpProcess.Kill()
            $dumpProcess.WaitForExit()
        } elseif ($dumpProcess.ExitCode -eq 0) {
            & cmd.exe /d /c (
                "adb -s $script:deviceSerial pull $devicePath `"$localPath`" " +
                ">nul 2>&1"
            )
            if ($LASTEXITCODE -eq 0 -and
                (Test-Path -LiteralPath $localPath) -and
                (Get-Item -LiteralPath $localPath).Length -gt 0) {
                return Get-Content -LiteralPath $localPath -Raw -Encoding UTF8
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Could not retrieve the Doubao UI hierarchy after retries"
}

function Get-NativeNodeBounds {
    param([Parameter(Mandatory)]$Node)

    if ($Node.GetAttribute("bounds") -notmatch (
        "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
    )) {
        return $null
    }
    $left = [int]$Matches[1]
    $top = [int]$Matches[2]
    $right = [int]$Matches[3]
    $bottom = [int]$Matches[4]
    if ($right -le $left -or $bottom -le $top) {
        return $null
    }
    @{
        left = $left
        top = $top
        right = $right
        bottom = $bottom
        center_x = [int](($left + $right) / 2)
        center_y = [int](($top + $bottom) / 2)
    }
}

function Invoke-NativeNodeTap {
    param([Parameter(Mandatory)]$Node)

    $tapNode = $Node
    $bounds = Get-NativeNodeBounds -Node $tapNode
    while (-not $bounds -and $tapNode.ParentNode) {
        $tapNode = $tapNode.ParentNode
        $bounds = Get-NativeNodeBounds -Node $tapNode
    }
    if (-not $bounds) {
        throw "Android UI node does not expose valid bounds"
    }
    & adb -s $script:deviceSerial shell input tap `
        $bounds.center_x $bounds.center_y | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "ADB failed to tap the Android UI node"
    }
}

function Get-DirectClipboardText {
    $previousIme = (
        & adb -s $script:deviceSerial shell settings get secure default_input_method
    ).Trim()
    try {
        & adb -s $script:deviceSerial shell ime set `
            io.appium.settings/.AppiumIME | Out-Null
        Start-Sleep -Milliseconds 400
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
        $text
    } finally {
        if ($previousIme -and $previousIme -ne "null") {
            & adb -s $script:deviceSerial shell ime set $previousIme | Out-Null
        }
    }
}

function Get-RecentTaskBlock {
    param(
        [Parameter(Mandatory)][string]$State,
        [int]$TaskId = -1
    )

    $lines = @()
    $inside = $false
    foreach ($line in @($State -split "`r?`n")) {
        if ($line -match '^\s*\* Recent #(\d+): Task\{[^#]*#(\d+)') {
            if ($inside) { break }
            $inside = if ($TaskId -ge 0) {
                [int]$Matches[2] -eq $TaskId
            } else {
                [int]$Matches[1] -eq 0
            }
        } elseif ($inside -and $line -match '^\s*Visible recent tasks') {
            break
        }
        if ($inside) { $lines += $line }
    }
    $lines -join "`n"
}

function Get-DouyinSharedUrlFromText {
    param([Parameter(Mandatory)][string]$Text)

    $urls = @([regex]::Matches(
        $Text,
        'https?://[^\s<>"''\u3000]+'
    ) | ForEach-Object {
        $_.Value.TrimEnd('.', ',', ';', ')', ']', '"')
    } | Where-Object {
        $uri = $null
        [Uri]::TryCreate($_, [UriKind]::Absolute, [ref]$uri) -and
            $uri.Host -in @("v.douyin.com", "www.iesdouyin.com")
    } | Select-Object -Unique)
    if ($urls.Count -ne 1) {
        throw "Douyin share text did not contain exactly one source URL"
    }
    $urls[0]
}

function Test-DouyinSourceTitle {
    param(
        [Parameter(Mandatory)][xml]$Document,
        [Parameter(Mandatory)][string]$Title
    )

    $normalizedTitle = $Title -replace '\s+', ''
    if (-not $normalizedTitle) { return $false }
    $prefix = $normalizedTitle.Substring(0, [math]::Min(16, $normalizedTitle.Length))
    foreach ($node in @($Document.SelectNodes(
        "//*[@package='com.ss.android.ugc.aweme' and " +
        "(@text or @content-desc)]"
    ))) {
        foreach ($value in @($node.GetAttribute("text"),
            $node.GetAttribute("content-desc"))) {
            if (($value -replace '\s+', '').Contains($prefix)) {
                return $true
            }
        }
    }
    $false
}

function Get-DouyinSourceShareUrl {
    param(
        [string]$ClipboardBefore,
        [Parameter(Mandatory)][string]$ExpectedTitle
    )

    $size = & adb -s $script:deviceSerial shell wm size | Out-String
    $dimensions = @([regex]::Matches($size, '(\d+)x(\d+)')) |
        Select-Object -Last 1
    if (-not $dimensions) { throw "Could not determine Douyin display size" }
    $width = [int]$dimensions.Groups[1].Value
    $height = [int]$dimensions.Groups[2].Value
    [xml]$document = Get-NativePageSource
    if (-not (Test-DouyinSourceTitle -Document $document -Title $ExpectedTitle)) {
        throw "Douyin content did not match the cited source title"
    }
    $shareButton = $document.SelectSingleNode(
        "//*[@package='com.ss.android.ugc.aweme' and " +
        "contains(@content-desc,'分享') and contains(@content-desc,'按钮')]"
    )
    if (-not $shareButton) { throw "Douyin source did not expose Share" }
    Invoke-NativeNodeTap -Node $shareButton
    Start-Sleep -Milliseconds 700
    for ($attempt = 0; $attempt -lt 8; $attempt++) {
        [xml]$shareDocument = Get-NativePageSource
        $shareLink = @($shareDocument.SelectNodes("//*[@text='分享链接']") |
            Where-Object {
                $bounds = Get-NativeNodeBounds -Node $_
                $bounds -and $bounds.right -le $width -and
                    $bounds.center_x -gt 50
            }) | Select-Object -First 1
        if ($shareLink) {
            Invoke-NativeNodeTap -Node $shareLink
            Start-Sleep -Milliseconds 700
            $clipboard = Get-DirectClipboardText
            if (-not $clipboard -or $clipboard -eq $ClipboardBefore) {
                throw "Douyin Share Link did not update the clipboard"
            }
            return Get-DouyinSharedUrlFromText -Text $clipboard
        }
        $startX = [int]($width * 0.78)
        $endX = [int]($width * 0.26)
        $rowY = [int]($height * 0.926)
        & adb -s $script:deviceSerial shell input swipe `
            $startX $rowY $endX $rowY 400 | Out-Null
        Start-Sleep -Milliseconds 400
    }
    throw "Douyin Share Link action was not found"
}

function Get-RecentTaskUrl {
    param([Parameter(Mandatory)][string]$Block)

    if ($Block -match 'dat=(https?://[^\s}\]]+)') {
        return [Uri]::UnescapeDataString($Matches[1])
    }
    $hostMatch = [regex]::Match($Block, '(?:[?&])host=([^&\s}]+)')
    $groupIdMatch = [regex]::Match($Block, '(?:[?&])group_id=(\d+)')
    if ($Block -match 'dat=snssdk[^\s}]*' -and
        $hostMatch.Success -and $groupIdMatch.Success) {
        $hostName = [Uri]::UnescapeDataString($hostMatch.Groups[1].Value)
        return "https://$hostName/share/video/$($groupIdMatch.Groups[1].Value)"
    }
    $null
}

function Get-ForegroundIntentUrl {
    param(
        [string]$PreviousRecentState,
        [string]$RecentState,
        [string]$ForegroundPackage
    )

    if (-not $RecentState) {
        $RecentState = & adb -s $script:deviceSerial shell dumpsys activity recents |
            Out-String
    }
    if (-not $ForegroundPackage) {
        $ForegroundPackage = Get-ForegroundPackage
    }
    if (-not $PreviousRecentState) { return $null }
    $recent = Get-RecentTaskBlock -State $RecentState
    if ($recent -notmatch '^\s*\* Recent #0: Task\{[^#]*#(\d+)[^\r\n]*A=\d+:([a-zA-Z0-9._]+)') {
        return $null
    }
    $taskId = [int]$Matches[1]
    $taskPackage = [string]$Matches[2]
    if ($taskPackage -ne $ForegroundPackage) { return $null }
    $url = Get-RecentTaskUrl -Block $recent
    if (-not $url -or $url -match '/\.\.\.(?:$|[?#])') { return $null }
    if ($PreviousRecentState) {
        $previous = Get-RecentTaskBlock `
            -State $PreviousRecentState -TaskId $taskId
        if ($previous -and (Get-RecentTaskUrl -Block $previous) -eq $url) {
            return $null
        }
    }
    return $url
}

function Get-ForegroundPackage {
    foreach ($line in @(
        & adb -s $script:deviceSerial shell dumpsys activity activities
    )) {
        if ($line -match 'mResumedActivity:.*\s([a-zA-Z0-9._]+)/') {
            return [string]$Matches[1]
        }
    }
    foreach ($line in @(& adb -s $script:deviceSerial shell dumpsys window)) {
        if ($line -match 'mCurrentFocus=.*\s([a-zA-Z0-9._]+)/') {
            return [string]$Matches[1]
        }
    }
    $null
}

function Find-AppiumElements {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$ResourceId
    )

    $response = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/elements" `
        -Body @{ using = "id"; value = $ResourceId }
    @(
        $response.value |
            ForEach-Object { $_.$elementKey } |
            Where-Object { $_ }
    )
}

function Wait-AppiumElements {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$ResourceId,
        [int]$TimeoutSeconds = 10
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $elements = @(Find-AppiumElements `
            -SessionId $SessionId `
            -ResourceId $ResourceId)
        if ($elements.Count -gt 0) {
            return $elements
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    @()
}

function Get-ElementText {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$ElementId
    )

    $response = Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$SessionId/element/$ElementId/text" `
        -Body $null
    [string]$response.value
}

function Get-ReferenceSummary {
    param([Parameter(Mandatory)][string]$Source)

    $result = @{
        search_keyword_count = 0
        reference_count = 0
        title = $null
    }
    try {
        [xml]$document = $Source
        $titleId = "$packageName`:id/tv_reference_title"
        $titleNodes = @($document.SelectNodes("//*[@resource-id='$titleId']"))
        if ($titleNodes.Count -eq 0) {
            # The collapsed search card uses a different resource ID and copy.
            # Treat its count as provisional; Get-DoubaoSources refreshes the
            # exact cited-reference count after opening the panel.
            $searchTitleId = "$packageName`:id/search_title"
            $titleNodes = @($document.SelectNodes(
                "//*[@resource-id='$searchTitleId']"
            ))
        }
        if ($titleNodes.Count -eq 0) {
            return $result
        }
        foreach ($titleNode in $titleNodes) {
            $title = $titleNode.GetAttribute("text")
            $result.title = $title
            if ($title -match "搜索\s*(\d+)\s*个关键词") {
                $result.search_keyword_count += [int]$Matches[1]
            }
            if ($title -match "参考\s*(\d+)\s*篇资料") {
                $result.reference_count += [int]$Matches[1]
            } elseif ($title -match "找到\s*(\d+)\s*篇资料") {
                $result.reference_count += [int]$Matches[1]
            }
        }
    } catch {
        return $result
    }
    $result
}

function Get-VisibleReferenceItems {
    param([Parameter(Mandatory)][string]$Source)

    try {
        [xml]$document = $Source
    } catch {
        return @()
    }

    $itemId = "$packageName`:id/ll_source_item"
    $titleId = "$packageName`:id/tv_reference_content"
    $items = @()
    foreach ($itemNode in @($document.SelectNodes("//*[@resource-id='$itemId']"))) {
        $titleNode = $itemNode.SelectSingleNode(".//*[@resource-id='$titleId']")
        if ($null -eq $titleNode) {
            continue
        }
        $title = $titleNode.GetAttribute("text").Trim()
        if (-not $title) {
            continue
        }
        $ordinal = $null
        foreach ($textNode in @($itemNode.SelectNodes(".//*[@text]"))) {
            if ($textNode.GetAttribute("text") -match "^\s*(\d+)\.\s*$") {
                $ordinal = [int]$Matches[1]
                break
            }
        }
        if ($null -eq $ordinal) {
            continue
        }
        $items += [pscustomobject]@{
            index = $ordinal
            title = $title
        }
    }
    @($items | Sort-Object index)
}

function Get-ReferenceListBounds {
    param([Parameter(Mandatory)][string]$Source)

    try {
        [xml]$document = $Source
        $containerId = "$packageName`:id/sub_keyword_reference"
        $container = $document.SelectSingleNode("//*[@resource-id='$containerId']")
        if ($null -eq $container) {
            return $null
        }
        $list = $container.SelectSingleNode(".//*[@class='androidx.recyclerview.widget.RecyclerView']")
        if ($null -eq $list) {
            return $null
        }
        if ($list.GetAttribute("bounds") -match "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$") {
            return @{
                left = [int]$Matches[1]
                top = [int]$Matches[2]
                width = [int]$Matches[3] - [int]$Matches[1]
                height = [int]$Matches[4] - [int]$Matches[2]
            }
        }
    } catch {
        return $null
    }
    $null
}

function Get-ClipboardText {
    param([Parameter(Mandatory)][string]$SessionId)

    $response = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/appium/device/get_clipboard" `
        -Body @{ contentType = "plaintext" }
    if (-not $response.value) {
        return $null
    }
    [Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String([string]$response.value)
    )
}

function Set-ClipboardText {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$Value
    )

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/appium/device/set_clipboard" `
        -Body @{
            contentType = "plaintext"
            content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
        } | Out-Null
}

function ConvertTo-CanonicalSourceUrl {
    param([Parameter(Mandatory)][string]$Url)

    try {
        $builder = [UriBuilder]::new($Url)
        if ($builder.Host -eq "seclink.bytedance.com") {
            foreach ($part in $builder.Query.TrimStart("?").Split("&")) {
                $pair = [string]$part -split "=", 2
                if ($pair.Count -eq 2 -and $pair[0] -eq "target") {
                    $target = [Uri]::UnescapeDataString($pair[1])
                    return ConvertTo-CanonicalSourceUrl -Url $target
                }
            }
        }
        $appQueryKeys = @(
            "use_xbridge3",
            "loader_name",
            "need_sec_link",
            "sec_link_scene",
            "theme"
        )
        $queryParts = @(
            $builder.Query.TrimStart("?").Split("&") |
                Where-Object {
                    if (-not $_) {
                        return $false
                    }
                    $key = ([string]$_ -split "=", 2)[0]
                    $key -notin $appQueryKeys
                }
        )
        $builder.Query = $queryParts -join "&"
        $builder.Fragment = ""
        $builder.Uri.AbsoluteUri
    } catch {
        $Url
    }
}

function Get-DoubaoTaskId {
    $activityState = & adb -s $script:deviceSerial shell dumpsys activity activities |
        Out-String
    if ($LASTEXITCODE -ne 0 -or
        $activityState -notmatch 'mResumedActivity:[^\r\n]*com\.larus\.nova/[^\r\n]*\s+t(\d+)\}') {
        throw "Could not identify the active Doubao Android task"
    }
    [int]$Matches[1]
}

function Resume-DoubaoFromRecents {
    & adb -s $script:deviceSerial shell input keyevent 187 | Out-Null
    Start-Sleep -Milliseconds 900
    foreach ($direction in @("right", "left")) {
        $limit = if ($direction -eq "right") { 6 } else { 12 }
        for ($attempt = 0; $attempt -lt $limit; $attempt++) {
            [xml]$document = Get-NativePageSource
            $title = $document.SelectSingleNode(
                "//*[@resource-id='com.huawei.android.launcher:id/title' " +
                "and @text='豆包']"
            )
            if ($title) {
                $bounds = Get-NativeNodeBounds -Node $title
                $x = [int]($bounds.center_x + 140)
                $y = [int]($bounds.bottom + 600)
                & adb -s $script:deviceSerial shell input tap $x $y | Out-Null
                Start-Sleep -Milliseconds 900
                if ((Get-ForegroundPackage) -ne $packageName -or
                    (Get-DoubaoTaskId) -ne $script:doubaoTaskId) {
                    throw "Recents did not restore the original Doubao task"
                }
                return
            }
            if ($direction -eq "right") {
                & adb -s $script:deviceSerial shell input swipe `
                    300 1200 850 1200 350 | Out-Null
            } else {
                & adb -s $script:deviceSerial shell input swipe `
                    850 1200 300 1200 350 | Out-Null
            }
            Start-Sleep -Milliseconds 450
        }
    }
    throw "Original Doubao task was not found in recent apps"
}

function Return-ToDoubaoChat {
    param([Parameter(Mandatory)][string]$SessionId)

    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -eq $packageName) {
            [xml]$document = Get-NativePageSource
            $restoredNode = @($document.SelectNodes(
                "//*[@resource-id='$packageName`:id/tv_reference_content' or " +
                "@resource-id='$packageName`:id/ll_reference_title' or " +
                "@resource-id='$packageName`:id/search_title' or " +
                "@resource-id='$packageName`:id/input_text']"
            ) | Where-Object {
                $bounds = Get-NativeNodeBounds -Node $_
                $bounds -and $bounds.bottom -gt 0
            }) | Select-Object -First 1
            if ($restoredNode) {
                return $true
            }
            $detailBackNode = $document.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/btn_back']"
            )
            if ($detailBackNode) {
                Invoke-NativeNodeTap -Node $detailBackNode
            } else {
                & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
            }
            Start-Sleep -Milliseconds 750
            continue
        }
        if ($attempt -lt 2) {
            & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
        } elseif ($script:doubaoTaskId) {
            Resume-DoubaoFromRecents
        } else {
            throw "Original Doubao task ID is unavailable"
        }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function New-DoubaoAppiumSession {
    param([switch]$ActivateApp)

    $session = Invoke-AppiumRequest `
        -Method Post `
        -Path "/session" `
        -Body $script:appiumCapabilities `
        -TimeoutSeconds 60
    $newSessionId = [string]$session.value.sessionId
    if (-not $newSessionId) {
        throw "Appium did not return a source-collection session ID"
    }
    if ($ActivateApp) {
        Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$newSessionId/execute/sync" `
            -Body @{
                script = "mobile: activateApp"
                args = @(@{ appId = $packageName })
            } | Out-Null
    }
    Start-Sleep -Seconds 1
    $newSessionId
}

function Expand-ReferenceList {
    param([Parameter(Mandatory)][string]$SessionId)

    $visibleItems = @(Find-AppiumElements `
        -SessionId $SessionId `
        -ResourceId "$packageName`:id/tv_reference_content")
    if ($visibleItems.Count -gt 0) {
        return
    }
    $referenceTitle = Find-AppiumElement `
        -SessionId $SessionId `
        -ResourceId "$packageName`:id/ll_reference_title" `
        -TimeoutSeconds 5 `
        -Optional
    if ($referenceTitle) {
        Invoke-ElementClick -SessionId $SessionId -ElementId $referenceTitle
        Start-Sleep -Seconds 1
    }
}

function Restore-NativeReferencePanel {
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -ne $packageName) {
            if (-not $script:doubaoTaskId) {
                throw "Original Doubao task ID is unavailable"
            }
            Resume-DoubaoFromRecents
            Start-Sleep -Milliseconds 750
            continue
        }
        [xml]$document = Get-NativePageSource
        if ($document.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/tv_reference_content']"
        )) {
            return
        }
        $referenceTitle = $document.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/ll_reference_title']"
        )
        if ($referenceTitle) {
            Invoke-NativeNodeTap -Node $referenceTitle
            Start-Sleep -Milliseconds 700
            continue
        }
        $searchTitle = $document.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/search_title']"
        )
        if (
            $searchTitle -and
            $searchTitle.GetAttribute("text") -match "找到\s*\d+\s*篇资料"
        ) {
            Invoke-NativeNodeTap -Node $searchTitle
            Start-Sleep -Milliseconds 700
            continue
        }
        if ($document.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/input_text']"
        )) {
            & adb -s $script:deviceSerial shell input swipe `
                540 700 540 1950 500 | Out-Null
            Start-Sleep -Milliseconds 500
            continue
        }
        & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
        Start-Sleep -Milliseconds 700
    }
    throw "Could not restore the Doubao reference panel"
}

function Complete-DoubaoSourceRecords {
    param(
        [Parameter(Mandatory)][object[]]$Records,
        [Parameter(Mandatory)][int]$ReferenceCount,
        [string]$CollectionFailure
    )

    $byIndex = @{}
    foreach ($record in $Records) {
        $index = [int]$record.index
        if ($index -lt 1) { continue }
        if (-not $byIndex.ContainsKey($index) -or
            ($byIndex[$index].status -ne "collected" -and
                $record.status -eq "collected")) {
            $byIndex[$index] = $record
        }
    }
    $highestIndex = if ($byIndex.Count -gt 0) {
        @($byIndex.Keys | Measure-Object -Maximum)[0].Maximum
    } else { 0 }
    $count = [int][math]::Max($ReferenceCount, $highestIndex)
    $sources = @()
    for ($index = 1; $index -le $count; $index++) {
        if ($byIndex.ContainsKey($index)) {
            $sources += $byIndex[$index]
            continue
        }
        $sources += [pscustomobject][ordered]@{
            index = $index
            title = $null
            page_title = $null
            domain = $null
            url = $null
            raw_url = $null
            url_resolution = "unavailable"
            status = "failed"
            error_message = if ($CollectionFailure) {
                "Source collection interrupted: $CollectionFailure"
            } else {
                "Reference item was not exposed by the Doubao UI"
            }
        }
    }
    @{ reference_count = $count; sources = $sources }
}

function Get-DoubaoVisibleSourceNodes {
    param([Parameter(Mandatory)][xml]$Document)

    $items = @()
    foreach ($itemNode in @($Document.SelectNodes(
        "//*[@resource-id='$packageName`:id/ll_source_item']"
    ))) {
        $titleNode = $itemNode.SelectSingleNode(
            ".//*[@resource-id='$packageName`:id/tv_reference_content']"
        )
        if (-not $titleNode) { continue }
        $ordinal = $null
        foreach ($textNode in @($itemNode.SelectNodes(".//*[@text]"))) {
            if ($textNode.GetAttribute("text") -match '^\s*(\d+)\.\s*$') {
                $ordinal = [int]$Matches[1]
                break
            }
        }
        $bounds = Get-NativeNodeBounds -Node $itemNode
        $title = $titleNode.GetAttribute("text").Trim()
        if ($null -ne $ordinal -and $bounds -and $title) {
            $items += [pscustomobject]@{
                index = $ordinal
                title = $title
                node = $itemNode
            }
        }
    }
    @($items | Sort-Object index)
}

function Invoke-DoubaoReferenceSwipe {
    param(
        [Parameter(Mandatory)][xml]$Document,
        [Parameter(Mandatory)][ValidateSet("up", "down")][string]$Direction
    )

    $list = $Document.SelectSingleNode(
        "//*[@resource-id='$packageName`:id/message_list' and @scrollable='true']"
    )
    if (-not $list) { throw "Doubao scrollable message_list was not found" }
    $bounds = Get-NativeNodeBounds -Node $list
    $x = [int]($bounds.right - 100)
    if ($Direction -eq "up") {
        $startY = [int][math]::Min($bounds.bottom - 200, $bounds.top + 1150)
        $endY = [int][math]::Max($bounds.top + 250, $startY - 450)
        $duration = 450
    } else {
        $startY = [int]($bounds.top + 400)
        $endY = [int][math]::Min($bounds.bottom - 200, $bounds.top + 1400)
        $duration = 350
    }
    & adb -s $script:deviceSerial shell input swipe `
        $x $startY $x $endY $duration | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Doubao reference swipe failed" }
    Start-Sleep -Milliseconds 500
}

function Get-DoubaoSourceCatalog {
    param([Parameter(Mandatory)][int]$ReferenceCount)

    $seen = @{}
    $unchanged = 0
    for ($page = 0; $page -lt 30 -and $unchanged -lt 4; $page++) {
        [xml]$document = Get-NativePageSource
        $before = $seen.Count
        foreach ($item in @(Get-DoubaoVisibleSourceNodes -Document $document)) {
            if ($item.index -le $ReferenceCount -and -not $seen.ContainsKey($item.index)) {
                $seen[$item.index] = $item.title
            }
        }
        if ($seen.Count -ge $ReferenceCount) { break }
        Invoke-DoubaoReferenceSwipe -Document $document -Direction up
        $unchanged = if ($seen.Count -eq $before) { $unchanged + 1 } else { 0 }
    }
    @($seen.Keys | Sort-Object | ForEach-Object {
        [pscustomobject]@{ index = [int]$_; title = $seen[$_] }
    })
}

function Find-DoubaoSourceNode {
    param(
        [Parameter(Mandatory)][int]$Index,
        [string]$Title
    )

    $emptyPages = 0
    for ($attempt = 0; $attempt -lt 36; $attempt++) {
        [xml]$document = Get-NativePageSource
        $visible = @(Get-DoubaoVisibleSourceNodes -Document $document)
        if ($visible.Count -eq 0) {
            if ($emptyPages -ge 3) {
                Restore-NativeReferencePanel
                $emptyPages = 0
            } else {
                Invoke-DoubaoReferenceSwipe -Document $document -Direction down
                $emptyPages++
            }
            continue
        }
        $match = @($visible | Where-Object { $_.index -eq $Index }) |
            Select-Object -First 1
        if ($match) {
            if ($Title -and $match.title -ne $Title) {
                throw "Doubao reference $Index title changed during collection"
            }
            return $match
        }
        $minIndex = [int]$visible[0].index
        $maxIndex = [int]$visible[-1].index
        if ($Index -lt $minIndex) {
            Invoke-DoubaoReferenceSwipe -Document $document -Direction down
        } elseif ($Index -gt $maxIndex) {
            Invoke-DoubaoReferenceSwipe -Document $document -Direction up
        } else {
            throw "Doubao reference $Index was missing between visible ordinals"
        }
    }
    throw "Doubao reference $Index was not found after navigation"
}

function Test-DoubaoRetryableSourceError {
    param([string]$Message)

    [bool]($Message -match 'clipboard|UI hierarchy|share sheet|did not expose Share|reference panel')
}

function Get-DoubaoSources {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$AnswerSource,
        [object[]]$KnownSources = @()
    )

    $summary = Get-ReferenceSummary -Source $AnswerSource
    if ($summary.reference_count -le 0) {
        # Long answers can leave the reference card outside the accessibility
        # viewport. Walk toward the start of the latest isolated conversation.
        for ($attempt = 0; $attempt -lt 18; $attempt++) {
            & adb -s $script:deviceSerial shell input swipe `
                540 700 540 1950 500 | Out-Null
            Start-Sleep -Milliseconds 500
            $candidateSource = Get-NativePageSource
            $candidateSummary = Get-ReferenceSummary -Source $candidateSource
            if ($candidateSummary.reference_count -gt 0) {
                $AnswerSource = $candidateSource
                $summary = $candidateSummary
                break
            }
        }
    }
    if ($summary.reference_count -le 0) {
        return @{
            session_id = $null
            search_keyword_count = $summary.search_keyword_count
            reference_count = 0
            sources = @()
        }
    }

    Restore-NativeReferencePanel
    $script:doubaoTaskId = Get-DoubaoTaskId
    # The collapsed and expanded counts can update at different times while
    # Doubao is still filling the source list. Never lose a larger count.
    $expandedSummary = Get-ReferenceSummary -Source (Get-NativePageSource)
    if ($expandedSummary.reference_count -gt 0) {
        $summary.reference_count = [math]::Max(
            $summary.reference_count,
            $expandedSummary.reference_count
        )
        $summary.search_keyword_count = [math]::Max(
            $summary.search_keyword_count,
            $expandedSummary.search_keyword_count
        )
    }
    for ($topAttempt = 0; $topAttempt -lt 12; $topAttempt++) {
        [xml]$topDocument = Get-NativePageSource
        $firstItem = $topDocument.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/ll_source_item']" +
            "[.//*[@text='1.']]"
        )
        if ($firstItem) { break }
        $scrollList = $topDocument.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/message_list' and @scrollable='true']"
        )
        if (-not $scrollList) { break }
        $scrollBounds = Get-NativeNodeBounds -Node $scrollList
        $scrollX = [int]($scrollBounds.right - 100)
        $scrollEndY = [int][math]::Min(
            $scrollBounds.bottom - 200,
            $scrollBounds.top + 1400
        )
        & adb -s $script:deviceSerial shell input swipe `
            $scrollX ($scrollBounds.top + 400) $scrollX $scrollEndY 350 | Out-Null
        Start-Sleep -Milliseconds 500
    }
    $catalog = @(Get-DoubaoSourceCatalog -ReferenceCount $summary.reference_count)
    $catalogByIndex = @{}
    foreach ($catalogItem in $catalog) {
        $catalogByIndex[[int]$catalogItem.index] = [string]$catalogItem.title
    }
    $collected = @{}
    $collectedOrder = [Collections.Generic.List[string]]::new()
    $failureAttempts = @{}
    $catalogCursor = 1
    $collectionFailure = $null
    try {
        while ($catalogCursor -le $summary.reference_count -and
            $catalogCursor -le 60) {
            $catalogTitle = if ($catalogByIndex.ContainsKey($catalogCursor)) {
                $catalogByIndex[$catalogCursor]
            } else { $null }
            $key = "$catalogCursor|$catalogTitle"
            $known = if ($KnownSources.Count) {
                Find-KnownSourceRecord -Records $KnownSources -Index $catalogCursor -Title $catalogTitle
            } else { $null }
            if ($known) {
                $collected[$key] = $known
                $collectedOrder.Add($key)
                $catalogCursor++
                continue
            }
            $item = $null
            $locationError = $null
            try {
                $item = Find-DoubaoSourceNode `
                    -Index $catalogCursor -Title $catalogTitle
            } catch {
                $locationError = $_.Exception.Message
            }
            if ($item) {
                $sourceResult = [ordered]@{
                    index = $catalogCursor
                    title = [string]$item.title
                    page_title = $null
                    domain = $null
                    url = $null
                    raw_url = $null
                    url_resolution = "unavailable"
                    status = "failed"
                    error_message = $null
                }
                $clipboardBefore = $null
                $recentBefore = $null
                try {
                    try { $clipboardBefore = Get-DirectClipboardText } catch {}
                    try {
                        $recentBefore = & adb -s $script:deviceSerial shell `
                            dumpsys activity recents | Out-String
                    } catch {}
                    Invoke-NativeNodeTap -Node $item.node
                    Start-Sleep -Seconds 2

                    $foregroundPackage = Get-ForegroundPackage
                    $intentUrl = if ($foregroundPackage -ne $packageName) {
                        Get-ForegroundIntentUrl `
                            -PreviousRecentState $recentBefore `
                            -ForegroundPackage $foregroundPackage
                    } else {
                        $null
                    }
                    if ($intentUrl) {
                        $canonicalIntent = ConvertTo-CanonicalSourceUrl -Url $intentUrl
                        $previousSource = @($collected.Values | Where-Object {
                            $_.url -eq $canonicalIntent -and
                                $_.title -ne $sourceResult.title
                        }) | Select-Object -First 1
                        if ($previousSource) { $intentUrl = $null }
                    }
                    $rawUrl = $intentUrl
                    if (-not $rawUrl -and
                        $foregroundPackage -eq "com.ss.android.ugc.aweme") {
                        $rawUrl = Get-DouyinSourceShareUrl `
                            -ClipboardBefore $clipboardBefore `
                            -ExpectedTitle $sourceResult.title
                    }
                    if (-not $rawUrl) {
                        $detailDocument = $null
                        try { [xml]$detailDocument = Get-NativePageSource } catch {}
                        $pageTitleNode = if ($detailDocument) {
                            $detailDocument.SelectSingleNode(
                                "//*[@resource-id='$packageName`:id/tv_title']"
                            )
                        } else { $null }
                        if ($pageTitleNode) {
                            $sourceResult.page_title = $pageTitleNode.GetAttribute("text")
                        }
                        $shareButton = if ($detailDocument) {
                            $detailDocument.SelectSingleNode(
                                "//*[@resource-id='$packageName`:id/btn_share' or " +
                                "@content-desc='分享']"
                            )
                        } else { $null }
                        if (-not $shareButton) {
                            # A cold external app launch can leave Doubao focused briefly.
                            for ($launchAttempt = 0; $launchAttempt -lt 8; $launchAttempt++) {
                                Start-Sleep -Milliseconds 750
                                $foregroundPackage = Get-ForegroundPackage
                                if ($foregroundPackage -ne $packageName) {
                                    $rawUrl = Get-ForegroundIntentUrl `
                                        -PreviousRecentState $recentBefore `
                                        -ForegroundPackage $foregroundPackage
                                    if (-not $rawUrl -and
                                        $foregroundPackage -eq "com.ss.android.ugc.aweme") {
                                        $rawUrl = Get-DouyinSourceShareUrl `
                                            -ClipboardBefore $clipboardBefore `
                                            -ExpectedTitle $sourceResult.title
                                    }
                                    if ($rawUrl) {
                                        break
                                    }
                                } else {
                                    try {
                                        [xml]$detailDocument = Get-NativePageSource
                                    } catch {
                                        continue
                                    }
                                    $shareButton = $detailDocument.SelectSingleNode(
                                        "//*[@resource-id='$packageName`:id/btn_share' or " +
                                        "@content-desc='分享']"
                                    )
                                    if ($shareButton) {
                                        break
                                    }
                                }
                            }
                        }
                        if ($rawUrl) {
                            $shareButton = $null
                        } elseif (-not $shareButton) {
                            try {
                                [xml]$detailDocument = Get-NativePageSource
                                $shareButton = $detailDocument.SelectSingleNode(
                                    "//*[@resource-id='$packageName`:id/btn_share' or " +
                                    "@content-desc='分享']"
                                )
                            } catch {}
                        }
                        if (-not $rawUrl -and -not $shareButton) {
                            throw "Doubao source detail did not expose Share"
                        }
                        if (-not $rawUrl) {
                            Invoke-NativeNodeTap -Node $shareButton
                            Start-Sleep -Milliseconds 800
                            try {
                                [xml]$shareDocument = Get-NativePageSource
                                $copyLinkNode = @($shareDocument.SelectNodes(
                                    "//*[@resource-id='$packageName`:id/tv_app_name']"
                                ) | Where-Object {
                                    ([string]$_.GetAttribute("text")).Contains($copyLinkLabel)
                                }) | Select-Object -First 1
                                if (-not $copyLinkNode) {
                                    throw "Doubao share sheet did not expose Copy Link"
                                }
                                Invoke-NativeNodeTap -Node $copyLinkNode
                                Start-Sleep -Milliseconds 600
                                $rawUrl = Get-DirectClipboardText
                                if ($rawUrl -eq $clipboardBefore) {
                                    $existing = @($collected.Values | Where-Object {
                                        $_.url -eq (ConvertTo-CanonicalSourceUrl -Url $rawUrl)
                                    }) | Select-Object -First 1
                                    if ($existing -and $existing.title -ne $sourceResult.title) {
                                        throw "Copy Link did not update the clipboard"
                                    }
                                }
                                if ($rawUrl -notmatch '^https?://') {
                                    throw "Doubao Copy Link did not provide an HTTP URL"
                                }
                            } catch {
                                if (-not (Test-ShareReceiverEnabled -Serial $script:deviceSerial)) { throw }
                                [xml]$shareState = Get-NativePageSource
                                if (-not $shareState.SelectSingleNode(
                                    "//*[@text='更多' or @text='其他' or @text='$copyLinkLabel']"
                                )) {
                                    Invoke-NativeNodeTap -Node $shareButton
                                    Start-Sleep -Milliseconds 700
                                }
                                $rawUrl = Invoke-ShareReceiverOnOpenSheet `
                                    -Serial $script:deviceSerial `
                                    -SessionId $SessionId
                            }
                        }
                    }

                    $uri = $null
                    if (
                        -not [Uri]::TryCreate($rawUrl, [UriKind]::Absolute, [ref]$uri) -or
                        $uri.Scheme -notin @("http", "https")
                    ) {
                        throw "Doubao did not expose an HTTP source URL"
                    }
                    $canonicalUrl = ConvertTo-CanonicalSourceUrl -Url $rawUrl
                    if (([Uri]$canonicalUrl).Host -eq "www.doubao.com" -and
                        ([Uri]$canonicalUrl).AbsolutePath -like "/thread/*") {
                        throw "Doubao conversation URL is not a source website"
                    }
                    $sourceResult.raw_url = $rawUrl
                    $sourceResult.url = $canonicalUrl
                    $sourceResult.domain = ([Uri]$canonicalUrl).Host.ToLowerInvariant()
                    $sourceResult.url_resolution = "exact"
                    $sourceResult.status = "collected"
                } catch {
                    $sourceResult.error_message = $_.Exception.Message
                } finally {
                    try {
                        Return-ToDoubaoChat -SessionId "adb" | Out-Null
                        Restore-NativeReferencePanel
                    } catch {
                        if (-not $sourceResult.error_message) {
                            $sourceResult.error_message = $_.Exception.Message
                        }
                    }
                }
                if ($sourceResult.status -eq "failed") {
                    $attemptCount = 1
                    if ($failureAttempts.ContainsKey($key)) {
                        $attemptCount = [int]$failureAttempts[$key] + 1
                    }
                    $failureAttempts[$key] = $attemptCount
                    if ($attemptCount -lt 3 -and
                        (Test-DoubaoRetryableSourceError -Message $sourceResult.error_message)) {
                        continue
                    }
                }
                $collected[$key] = [pscustomobject]$sourceResult
                $collectedOrder.Add($key)
                $catalogCursor++
                continue
            }
            $collected[$key] = [pscustomobject][ordered]@{
                index = $catalogCursor
                title = $catalogTitle
                page_title = $null
                domain = $null
                url = $null
                raw_url = $null
                url_resolution = "unavailable"
                status = "failed"
                error_message = $locationError
            }
            $collectedOrder.Add($key)
            $catalogCursor++
        }
    } catch {
        $collectionFailure = $_.Exception.Message
    }

    $completed = Complete-DoubaoSourceRecords `
        -Records @($collectedOrder | ForEach-Object { $collected[$_] }) `
        -ReferenceCount $summary.reference_count `
        -CollectionFailure $collectionFailure
    @{
        session_id = $null
        search_keyword_count = $summary.search_keyword_count
        reference_count = $completed.reference_count
        sources = @($completed.sources)
    }
}

function Get-AssistantMessage {
    param([Parameter(Mandatory)][string]$Source)

    try {
        [xml]$document = $Source
    } catch {
        return $null
    }

    $contentId = "$packageName`:id/content_view"
    $copyId = "$packageName`:id/msg_action_copy"
    $assistantNodes = @()
    $nativeFallback = $false
    foreach ($contentNode in @($document.SelectNodes("//*[@resource-id='$contentId']"))) {
        $messageNode = $contentNode.ParentNode
        if ($null -eq $messageNode) {
            continue
        }
        $copyNode = $messageNode.SelectSingleNode(".//*[@resource-id='$copyId']")
        if ($null -ne $copyNode) {
            $assistantNodes += $contentNode
        }
    }
    if ($assistantNodes.Count -eq 0) {
        # Native uiautomator does not expose msg_action_copy, but it does
        # expose the same content_view containers in message order.
        $assistantNodes = @(
            $document.SelectNodes("//*[@resource-id='$contentId']") |
                Where-Object {
                    $_.SelectSingleNode(
                        ".//*[@resource-id='$packageName`:id/tv_reference_title']"
                    ) -or
                    @($_.SelectNodes(".//*[@text]")).Count -gt 1
                }
        )
        if ($assistantNodes.Count -eq 0) {
            return $null
        }
        $nativeFallback = $true
    }

    $candidates = @()
    $candidateRoots = if ($nativeFallback) {
        $assistantNodes
    } else {
        @($assistantNodes[-1])
    }
    foreach ($candidateRoot in $candidateRoots) {
        foreach ($node in @($candidateRoot.SelectNodes(".//*"))) {
            foreach ($attributeName in @("content-desc", "text")) {
                $value = $node.GetAttribute($attributeName)
                if (-not [string]::IsNullOrWhiteSpace($value)) {
                    $candidates += $value.Trim()
                }
            }
        }
    }
    if ($candidates.Count -eq 0) {
        return $null
    }

    $answer = $candidates |
        Sort-Object -Property Length -Descending |
        Select-Object -First 1
    @{
        answer = $answer
        completed = (
            $null -ne $document.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/input_text']"
            ) -and
            $null -eq $document.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/action_stop']"
            )
        )
    }
}

function Get-FirstAssistantText {
    param(
        [Parameter(Mandatory)]
        [string]$Source,
        [Parameter(Mandatory)]
        [string]$Prompt
    )

    try {
        [xml]$document = $Source
    } catch {
        return $null
    }
    $messageListId = "$packageName`:id/message_list"
    $messageList = $document.SelectSingleNode("//*[@resource-id='$messageListId']")
    if ($null -eq $messageList) {
        return $null
    }
    $contentId = "$packageName`:id/content_view"
    foreach ($contentNode in @($messageList.SelectNodes(".//*[@resource-id='$contentId']"))) {
        foreach ($node in @($contentNode.SelectNodes(".//*[@text]"))) {
            $value = $node.GetAttribute("text")
            if (
                -not [string]::IsNullOrWhiteSpace($value) -and
                $value.Trim() -ne $Prompt.Trim()
            ) {
                return $value
            }
        }
    }
    $null
}

function Get-AdbDevices {
    $lines = @(& adb devices -l)
    @(
        $lines |
            Select-Object -Skip 1 |
            Where-Object { $_ -match "\sdevice(?:\s|$)" } |
            ForEach-Object { ($_ -split "\s+")[0] }
    )
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
        [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('/', ',') |
            ForEach-Object { "&$_-" }
    })
}

$sessionId = $null
try {
    $script:taskWorkingPrefix = ([string]$task.id) -replace "[^a-zA-Z0-9_-]", "_"
    $prompt = [string]$task.payload.prompt
    if ([string]::IsNullOrWhiteSpace($prompt)) {
        throw "Task payload.prompt is required"
    }
    if ($prompt.Length -gt 10000) {
        throw "Task payload.prompt exceeds 10000 characters"
    }

    $timeoutSeconds = 180
    if ($null -ne $task.payload.timeout_seconds) {
        $timeoutSeconds = [int]$task.payload.timeout_seconds
    }
    if ($timeoutSeconds -lt 15 -or $timeoutSeconds -gt 600) {
        throw "Task payload.timeout_seconds must be between 15 and 600"
    }

    $newConversation = $true
    if ($null -ne $task.payload.new_conversation) {
        $newConversation = [bool]$task.payload.new_conversation
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
    # Rebuild the activity stack so an external source app or embedded browser
    # from the previous attempt cannot poison new-conversation navigation.
    $foregroundPackage = Get-ForegroundPackage
    if (
        $foregroundPackage -and
        $foregroundPackage -ne $packageName -and
        $foregroundPackage -notmatch '^com\.huawei\.android\.launcher$'
    ) {
        & adb -s $serial shell am force-stop $foregroundPackage | Out-Null
    }
    # A timed-out source collection can leave UiAutomator2 holding the device
    # accessibility bridge, which makes the next native hierarchy dump fail.
    & adb -s $serial shell am force-stop io.appium.uiautomator2.server | Out-Null
    & adb -s $serial shell am force-stop io.appium.uiautomator2.server.test | Out-Null
    Start-Sleep -Milliseconds 500
    & adb -s $serial shell input keyevent 3 | Out-Null
    & adb -s $serial shell am force-stop $packageName | Out-Null
    $capabilities = @{
        capabilities = @{
            alwaysMatch = @{
                platformName = "Android"
                "appium:automationName" = "UiAutomator2"
                "appium:deviceName" = $serial
                "appium:udid" = $serial
                "appium:noReset" = $true
                "appium:newCommandTimeout" = $timeoutSeconds + 60
                "appium:skipDeviceInitialization" = $true
                "appium:skipServerInstallation" = $true
                "appium:systemPort" = $systemPort
                "appium:mjpegServerPort" = $mjpegServerPort
            }
            firstMatch = @(@{})
        }
    }
    $script:appiumCapabilities = $capabilities
    & cmd.exe /d /c (
        "adb -s $serial shell am start -W -n " +
        "$packageName/com.larus.home.impl.alias.AliasActivity1 >nul 2>&1"
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not start Doubao"
    }
    Start-Sleep -Seconds 2

    if ($newConversation) {
        $newChatReady = $false
        for ($navigationAttempt = 0; $navigationAttempt -lt 5; $navigationAttempt++) {
            [xml]$navigationDocument = Get-NativePageSource
            $sideBarNewChatNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/side_bar_create_conversation']"
            )
            if (
                $sideBarNewChatNode -and
                $sideBarNewChatNode.GetAttribute("bounds") -match (
                    "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
                )
            ) {
                $sideBarNewChatX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
                $sideBarNewChatY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
                & adb -s $serial shell input tap $sideBarNewChatX $sideBarNewChatY | Out-Null
                $newChatReady = $true
                break
            }
            $drawerNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/side_bar_container']"
            )
            if ($drawerNode) {
                $drawerBackNode = $navigationDocument.SelectSingleNode(
                    "//*[@resource-id='$packageName`:id/back_icon']"
                )
                if ($drawerBackNode) {
                    Invoke-NativeNodeTap -Node $drawerBackNode
                } else {
                    & adb -s $serial shell input keyevent 4 | Out-Null
                }
                Start-Sleep -Milliseconds 700
                continue
            }
            $newChatNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/right_img' or " +
                "@resource-id='$packageName`:id/larus_chat_top_left_create_new_cvs']"
            )
            if ($newChatNode) {
                if ($newChatNode.GetAttribute("bounds") -notmatch (
                    "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
                )) {
                    throw "Could not determine the Doubao new-chat bounds"
                }
                $newChatX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
                $newChatY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
                & adb -s $serial shell input tap $newChatX $newChatY | Out-Null
                $newChatReady = $true
                break
            }
            $newTopicNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/topic_text']"
            )
            if (
                $newTopicNode -and
                $newTopicNode.GetAttribute("bounds") -match (
                    "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
                )
            ) {
                $newTopicX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
                $newTopicY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
                & adb -s $serial shell input tap $newTopicX $newTopicY | Out-Null
                $newChatReady = $true
                break
            }
            $backNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/back_icon']"
            )
            if (
                $backNode -and
                $backNode.GetAttribute("bounds") -match (
                    "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
                )
            ) {
                $backX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
                $backY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
                & adb -s $serial shell input tap $backX $backY | Out-Null
            } else {
                & adb -s $serial shell input keyevent 4 | Out-Null
            }
            Start-Sleep -Seconds 1
        }
        if (-not $newChatReady) {
            throw "Could not navigate to the Doubao conversation list"
        }
        Start-Sleep -Seconds 2
    }

    # Keep generation free of UiAutomator2 instrumentation, then attach a
    # read-only Appium session for source collection after completion.
    & adb -s $serial shell am force-stop io.appium.uiautomator2.server | Out-Null
    & adb -s $serial shell am force-stop io.appium.uiautomator2.server.test | Out-Null
    $sessionId = $null
    Start-Sleep -Seconds 2
    $textInputReady = $false
    for ($inputAttempt = 0; $inputAttempt -lt 3; $inputAttempt++) {
        & adb -s $serial shell input tap 878 2200 | Out-Null
        Start-Sleep -Seconds 1
        $inputFocus = (& adb -s $serial shell dumpsys input_method | Out-String)
        if ((Get-ForegroundPackage) -eq $packageName -and
            $inputFocus -match 'mServedView=[^\r\n]*app:id/input_text') {
            $textInputReady = $true
            break
        }
        try {
            $inputSource = Get-NativePageSource
            if ($inputSource -match "$packageName`:id/input_text") {
                $textInputReady = $true
                break
            }
        } catch {
            # Doubao's animated home can keep UiAutomator from reaching idle.
        }
    }
    if (-not $textInputReady) {
        throw "Could not switch Doubao to text input mode"
    }
    $previousIme = (
        & adb -s $serial shell settings get secure default_input_method
    ).Trim()
    try {
        & adb -s $serial shell ime set io.appium.settings/.UnicodeIME | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not activate Appium UnicodeIME"
        }
        Start-Sleep -Seconds 1
        $encodedPrompt = ConvertTo-ImapUtf7 -Text $prompt
        & adb -s $serial shell input text "'$encodedPrompt'" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not type the Doubao prompt"
        }
    } finally {
        if ($previousIme -and $previousIme -ne "null") {
            & adb -s $serial shell ime set $previousIme | Out-Null
        }
    }

    $sendNode = $null
    try {
        [xml]$draftDocument = Get-NativePageSource
        $sendNode = $draftDocument.SelectSingleNode(
            "//*[@resource-id='$packageName`:id/action_send']"
        )
    } catch {
        # The animated composer can prevent UiAutomator from reaching idle.
    }
    if ($sendNode -and $sendNode.GetAttribute("bounds") -match (
        "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
    )) {
        $sendX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
        $sendY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
    } else {
        & adb -s $serial shell input keyevent 4 | Out-Null
        Start-Sleep -Milliseconds 500
        $sizeOutput = (& adb -s $serial shell wm size | Out-String)
        $dimensions = @([regex]::Matches($sizeOutput, '(\d+)x(\d+)')) |
            Select-Object -Last 1
        if (-not $dimensions) { throw "Could not locate the Doubao send button" }
        $sendX = [int]([int]$dimensions.Groups[1].Value * 0.90)
        $sendY = [int]([int]$dimensions.Groups[2].Value * 0.925)
    }
    & adb -s $serial shell input tap $sendX $sendY | Out-Null
    $sentAt = Get-Date

    $deadline = $sentAt.AddSeconds($timeoutSeconds)
    $firstTokenAt = $null
    $finalSource = $null
    $message = $null
    $responseRetryCount = 0
    $lastAnswer = $null
    $stableAnswerCount = 0
    do {
        Start-Sleep -Seconds 2
        try {
            $source = Get-NativePageSource
        } catch {
            continue
        }
        if (
            $null -eq $firstTokenAt -and
            (Get-FirstAssistantText -Source $source -Prompt $prompt)
        ) {
            $firstTokenAt = Get-Date
        }
        $message = Get-AssistantMessage -Source $source
        if ($message.answer -and $message.answer -eq $lastAnswer) {
            $stableAnswerCount++
        } else {
            $stableAnswerCount = 0
            $lastAnswer = $message.answer
        }
        if (
            $null -ne $message -and
            $message.completed -and
            $message.answer.Length -ge 80 -and
            $stableAnswerCount -ge 1
        ) {
            $finalSource = $source
            break
        }
    } while ((Get-Date) -lt $deadline)

    if ($null -eq $message -or -not $message.answer) {
        if ($source.Contains($doubaoRetryMessage)) {
            throw "Doubao failed to generate the response after $responseRetryCount retries"
        }
        throw "Timed out waiting for Doubao response after $timeoutSeconds seconds"
    }
    $answerCompletedAt = Get-Date

    $sessionId = $null
    $sourceCollectionStartedAt = Get-Date
    $sourceCollection = Invoke-SourceCollectionRetry -Collect {
        param([object[]]$KnownSources)
        Get-DoubaoSources -SessionId "adb" -AnswerSource $finalSource -KnownSources $KnownSources
    }
    $sessionId = [string]$sourceCollection.session_id
    $sourceCollectionCompletedAt = Get-Date

    $safeTaskId = ([string]$task.id) -replace "[^a-zA-Z0-9_-]", "_"
    if (-not $safeTaskId) {
        $safeTaskId = [guid]::NewGuid().ToString()
    }
    $taskResultDirectory = Join-Path $resultRoot $safeTaskId
    New-Item -ItemType Directory -Path $taskResultDirectory -Force | Out-Null

    $sourcePath = Join-Path $taskResultDirectory "source.xml"
    [IO.File]::WriteAllText(
        $sourcePath,
        $finalSource,
        [Text.UTF8Encoding]::new($false)
    )
    $screenshotPath = Join-Path $taskResultDirectory "screenshot.png"
    $deviceScreenshot = "/sdcard/$safeTaskId-screenshot.png"
    & cmd.exe /d /c (
        "adb -s $serial shell screencap -p $deviceScreenshot >nul 2>&1"
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not capture the Doubao screenshot"
    }
    & cmd.exe /d /c (
        "adb -s $serial pull $deviceScreenshot `"$screenshotPath`" " +
        ">nul 2>&1"
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not retrieve the Doubao screenshot"
    }
    $screenshotHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $screenshotPath).Hash.ToLower()

    $versionLine = & adb -s $serial shell dumpsys package $packageName |
        Select-String "versionName=" |
        Select-Object -First 1
    $versionName = if ($versionLine) {
        ($versionLine.Line.Trim() -split "=", 2)[1]
    } else {
        $null
    }
    $sourceRecords = @($sourceCollection.sources)
    $sourceSuccessCount = @($sourceRecords | Where-Object {
        $_.status -eq "collected" -and $_.url -and $_.url_resolution -eq "exact"
    }).Count
    $sourceFailureCount = [math]::Max(
        $sourceRecords.Count - $sourceSuccessCount,
        [int]$sourceCollection.reference_count - $sourceSuccessCount
    )
    $sourceCompleteness = if ($sourceCollection.reference_count -gt 0) {
        [math]::Round(
            $sourceSuccessCount / [double]$sourceCollection.reference_count,
            4
        )
    } else {
        0.0
    }
    $captureStatus = if ($sourceCollection.reference_count -gt 0 -and $sourceCompleteness -ge 1) {
        "complete"
    } elseif ($sourceSuccessCount -gt 0) {
        "partial"
    } else {
        "answer_only"
    }
    $completedAt = Get-Date
    [pscustomobject]@{
        platform = "doubao"
        surface = "app"
        package_name = $packageName
        app_version = $versionName
        device_serial = $serial
        prompt = $prompt
        answer = [string]$message.answer
        started_at = $startedAt.ToString("o")
        sent_at = $sentAt.ToString("o")
        first_token_at = if ($firstTokenAt) { $firstTokenAt.ToString("o") } else { $null }
        completed_at = $completedAt.ToString("o")
        duration_ms = [math]::Round(($completedAt - $startedAt).TotalMilliseconds)
        response_latency_ms = if ($firstTokenAt) {
            [math]::Round(($firstTokenAt - $sentAt).TotalMilliseconds)
        } else {
            $null
        }
        answer_completed_at = $answerCompletedAt.ToString("o")
        source_collection_duration_ms = [math]::Round(
            ($sourceCollectionCompletedAt - $sourceCollectionStartedAt).TotalMilliseconds
        )
        search_keyword_count = $sourceCollection.search_keyword_count
        reference_count = $sourceCollection.reference_count
        source_count = $sourceRecords.Count
        source_success_count = $sourceSuccessCount
        source_failure_count = $sourceFailureCount
        source_completeness = $sourceCompleteness
        capture_status = $captureStatus
        sources = $sourceRecords
        screenshot_path = $screenshotPath
        screenshot_sha256 = $screenshotHash
        source_path = $sourcePath
    }
} finally {
    if ($sessionId) {
        try {
            Invoke-AppiumRequest `
                -Method Delete `
                -Path "/session/$sessionId" `
                -Body $null `
                -TimeoutSeconds 15 | Out-Null
        } catch {
            # The Appium new-command timeout will clean up an orphaned session.
        }
    }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
