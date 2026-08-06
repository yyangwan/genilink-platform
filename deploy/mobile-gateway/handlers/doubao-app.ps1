param(
    [Parameter(Mandatory)]
    [string]$TaskJson
)

$ErrorActionPreference = "Stop"
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
$mutex = [Threading.Mutex]::new($false, "Global\MobileGateway-Android-Device")

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
    $localPath = Join-Path $resultRoot "doubao-current.xml"
    $dumpProcess = Start-Process `
        -FilePath "adb" `
        -ArgumentList @("-s", $script:deviceSerial, "shell", "uiautomator", "dump", $devicePath) `
        -WindowStyle Hidden `
        -PassThru
    if (-not $dumpProcess.WaitForExit(15000)) {
        $dumpProcess.Kill()
        $dumpProcess.WaitForExit()
        throw "Timed out while dumping the Doubao UI hierarchy"
    }
    if ($dumpProcess.ExitCode -ne 0) {
        throw "Could not dump the Doubao UI hierarchy"
    }
    & cmd.exe /d /c (
        "adb -s $script:deviceSerial pull $devicePath `"$localPath`" " +
        ">nul 2>&1"
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not retrieve the Doubao UI hierarchy"
    }
    Get-Content -LiteralPath $localPath -Raw -Encoding UTF8
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

function Get-ForegroundIntentUrl {
    $recentLines = @()
    $insideCurrentTask = $false
    foreach ($line in @(& adb -s $script:deviceSerial shell dumpsys activity recents)) {
        if ($line -match '^\s*\* Recent #0:') {
            $insideCurrentTask = $true
        } elseif ($insideCurrentTask -and $line -match '^\s*\* Recent #\d+:') {
            break
        }
        if ($insideCurrentTask) {
            $recentLines += $line
        }
    }
    $recent = $recentLines -join "`n"
    if ($recent -match 'dat=(https?://[^\s}\]]+)') {
        return [Uri]::UnescapeDataString($Matches[1])
    }
    $hostMatch = [regex]::Match($recent, '(?:[?&])host=([^&\s}]+)')
    $groupIdMatch = [regex]::Match($recent, '(?:[?&])group_id=(\d+)')
    if ($recent -match 'dat=snssdk[^\s}]*' -and $hostMatch.Success -and $groupIdMatch.Success) {
        $hostName = [Uri]::UnescapeDataString($hostMatch.Groups[1].Value)
        return "https://$hostName/share/video/$($groupIdMatch.Groups[1].Value)"
    }
    $null
}

function Get-ForegroundPackage {
    foreach ($line in @(& adb -s $script:deviceSerial shell dumpsys window)) {
        if ($line -match 'mCurrentFocus=.*\s([a-zA-Z0-9._]+)/') {
            return [string]$Matches[1]
        }
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
        $titleNode = $document.SelectSingleNode("//*[@resource-id='$titleId']")
        if ($null -eq $titleNode) {
            # The collapsed search card uses a different resource ID and copy.
            # Treat its count as provisional; Get-DoubaoSources refreshes the
            # exact cited-reference count after opening the panel.
            $searchTitleId = "$packageName`:id/search_title"
            $titleNode = $document.SelectSingleNode(
                "//*[@resource-id='$searchTitleId']"
            )
        }
        if ($null -eq $titleNode) {
            return $result
        }
        $title = $titleNode.GetAttribute("text")
        $result.title = $title
        if ($title -match "搜索\s*(\d+)\s*个关键词") {
            $result.search_keyword_count = [int]$Matches[1]
        }
        if ($title -match "参考\s*(\d+)\s*篇资料") {
            $result.reference_count = [int]$Matches[1]
        } elseif ($title -match "找到\s*(\d+)\s*篇资料") {
            $result.reference_count = [int]$Matches[1]
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

function Return-ToDoubaoChat {
    param([Parameter(Mandatory)][string]$SessionId)

    # Some source schemes launch a separate app task. Stopping that task
    # reveals Doubao's preserved WebActivity; one Back then returns to the
    # reference panel without relaunching Doubao at its home screen.
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        $foregroundPackage = Get-ForegroundPackage
        if ($foregroundPackage -eq $packageName) {
            & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
            Start-Sleep -Seconds 1
            return $false
        }
        if (
            $foregroundPackage -and
            $foregroundPackage -notmatch '^com\.huawei\.android\.launcher$'
        ) {
            & adb -s $script:deviceSerial shell am force-stop `
                $foregroundPackage | Out-Null
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
        & adb -s $script:deviceSerial shell input keyevent 4 | Out-Null
        Start-Sleep -Milliseconds 700
    }
    throw "Could not restore the Doubao reference panel"
}

function Get-DoubaoSources {
    param(
        [Parameter(Mandatory)]
        [string]$SessionId,
        [Parameter(Mandatory)]
        [string]$AnswerSource
    )

    $summary = Get-ReferenceSummary -Source $AnswerSource
    if ($summary.reference_count -le 0) {
        return @{
            session_id = $null
            search_keyword_count = $summary.search_keyword_count
            reference_count = 0
            sources = @()
        }
    }

    Restore-NativeReferencePanel
    # The collapsed card can report searched documents while the expanded
    # panel reports the smaller set actually cited by the answer.
    $expandedSummary = Get-ReferenceSummary -Source (Get-NativePageSource)
    if ($expandedSummary.reference_count -gt 0) {
        $summary = $expandedSummary
    }
    $collected = @{}
    $stalledScrolls = 0
    $collectionFailure = $null
    try {
        while (
            $collected.Count -lt $summary.reference_count -and
            $stalledScrolls -lt 4
        ) {
            [xml]$expandedDocument = Get-NativePageSource
            $visibleItems = @()
            foreach ($itemNode in @($expandedDocument.SelectNodes(
                "//*[@resource-id='$packageName`:id/ll_source_item']"
            ))) {
                $titleNode = $itemNode.SelectSingleNode(
                    ".//*[@resource-id='$packageName`:id/tv_reference_content']"
                )
                if (-not $titleNode) {
                    continue
                }
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
                    $visibleItems += [pscustomobject]@{
                        index = $ordinal
                        title = $title
                        node = $itemNode
                    }
                }
            }

            $item = @($visibleItems | Where-Object {
                -not $collected.ContainsKey([string]$_.index)
            } | Sort-Object index) | Select-Object -First 1
            if ($item) {
                $key = [string]$item.index
                $sourceResult = [ordered]@{
                    index = [int]$item.index
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
                try {
                    try { $clipboardBefore = Get-DirectClipboardText } catch {}
                    Invoke-NativeNodeTap -Node $item.node
                    Start-Sleep -Seconds 2

                    $foregroundPackage = Get-ForegroundPackage
                    $intentUrl = if ($foregroundPackage -ne $packageName) {
                        Get-ForegroundIntentUrl
                    } else {
                        $null
                    }
                    $rawUrl = $intentUrl
                    if (-not $rawUrl) {
                        [xml]$detailDocument = Get-NativePageSource
                        $pageTitleNode = $detailDocument.SelectSingleNode(
                            "//*[@resource-id='$packageName`:id/tv_title']"
                        )
                        if ($pageTitleNode) {
                            $sourceResult.page_title = $pageTitleNode.GetAttribute("text")
                        }
                        $shareButton = $detailDocument.SelectSingleNode(
                            "//*[@resource-id='$packageName`:id/btn_share']"
                        )
                        if (-not $shareButton) {
                            # A cold external app launch can leave Doubao focused briefly.
                            for ($launchAttempt = 0; $launchAttempt -lt 8; $launchAttempt++) {
                                Start-Sleep -Milliseconds 750
                                $foregroundPackage = Get-ForegroundPackage
                                if ($foregroundPackage -ne $packageName) {
                                    $rawUrl = Get-ForegroundIntentUrl
                                    if ($rawUrl) {
                                        break
                                    }
                                }
                            }
                        }
                        if ($rawUrl) {
                            $shareButton = $null
                        } elseif (-not $shareButton) {
                            [xml]$detailDocument = Get-NativePageSource
                            $shareButton = $detailDocument.SelectSingleNode(
                                "//*[@resource-id='$packageName`:id/btn_share']"
                            )
                        }
                        if (-not $rawUrl -and -not $shareButton) {
                            throw "Doubao source detail did not expose Share"
                        }
                        if (-not $rawUrl) {
                            Invoke-NativeNodeTap -Node $shareButton
                            Start-Sleep -Milliseconds 800
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
                $collected[$key] = [pscustomobject]$sourceResult
                $stalledScrolls = 0
                continue
            }

            $container = $expandedDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/sub_keyword_reference']"
            )
            $listNode = if ($container) {
                $container.SelectSingleNode(
                    ".//*[@class='androidx.recyclerview.widget.RecyclerView']"
                )
            } else {
                $null
            }
            $listBounds = if ($listNode) {
                Get-NativeNodeBounds -Node $listNode
            } else {
                $null
            }
            if (-not $listBounds) {
                $stalledScrolls++
                continue
            }
            & adb -s $script:deviceSerial shell input swipe `
                $listBounds.center_x ($listBounds.bottom - 120) `
                $listBounds.center_x ($listBounds.top + 120) 500 | Out-Null
            Start-Sleep -Milliseconds 700
            $stalledScrolls++
        }
    } catch {
        $collectionFailure = $_.Exception.Message
    }

    $sources = @(
        $collected.Values |
            Sort-Object index
    )
    for ($missing = 1; $missing -le $summary.reference_count; $missing++) {
        if (-not $collected.ContainsKey([string]$missing)) {
            $sources += [pscustomobject][ordered]@{
                index = $missing
                title = $null
                page_title = $null
                domain = $null
                url = $null
                raw_url = $null
                url_resolution = "unavailable"
                status = "failed"
                error_message = if ($collectionFailure) {
                    "Source collection interrupted: $collectionFailure"
                } else {
                    "Reference item was not exposed by the Doubao UI"
                }
            }
        }
    }
    @{
        session_id = $null
        search_keyword_count = $summary.search_keyword_count
        reference_count = $summary.reference_count
        sources = @($sources | Sort-Object index)
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
    $task = $TaskJson | ConvertFrom-Json
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
            $newChatNode = $navigationDocument.SelectSingleNode(
                "//*[@resource-id='$packageName`:id/right_img']"
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
        $inputSource = Get-NativePageSource
        if ($inputSource -match "$packageName`:id/input_text") {
            $textInputReady = $true
            break
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

    $draftSource = Get-NativePageSource
    [xml]$draftDocument = $draftSource
    $sendNode = $draftDocument.SelectSingleNode(
        "//*[@resource-id='$packageName`:id/action_send']"
    )
    if (-not $sendNode -or $sendNode.GetAttribute("bounds") -notmatch (
        "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$"
    )) {
        throw "Could not locate the Doubao send button"
    }
    $sendX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
    $sendY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
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
        $source = Get-NativePageSource
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
    $sourceCollection = Get-DoubaoSources `
        -SessionId "adb" `
        -AnswerSource $finalSource
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
        $_.status -eq "collected" -and $_.url
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
