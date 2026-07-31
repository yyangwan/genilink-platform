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

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/element/$ElementId/click" `
        -Body @{} | Out-Null
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
            return $result
        }
        $title = $titleNode.GetAttribute("text")
        $result.title = $title
        if ($title -match "搜索\s*(\d+)\s*个关键词") {
            $result.search_keyword_count = [int]$Matches[1]
        }
        if ($title -match "参考\s*(\d+)\s*篇资料") {
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

    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        $referenceTitle = Find-AppiumElement `
            -SessionId $SessionId `
            -ResourceId "$packageName`:id/ll_reference_title" `
            -TimeoutSeconds 2 `
            -Optional
        if ($referenceTitle) {
            return
        }

        $backButton = Find-AppiumElement `
            -SessionId $SessionId `
            -ResourceId "$packageName`:id/btn_back" `
            -TimeoutSeconds 2 `
            -Optional
        if ($backButton) {
            Invoke-ElementClick -SessionId $SessionId -ElementId $backButton
        } else {
            Invoke-AppiumRequest `
                -Method Post `
                -Path "/session/$SessionId/back" `
                -Body @{} | Out-Null
        }
        Start-Sleep -Seconds 1
    }
    throw "Could not return to the Doubao chat after opening a reference"
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
            search_keyword_count = $summary.search_keyword_count
            reference_count = 0
            sources = @()
        }
    }

    Expand-ReferenceList -SessionId $SessionId
    $collected = @{}
    $stalledScrolls = 0
    while (
        $collected.Count -lt $summary.reference_count -and
        $stalledScrolls -lt 4
    ) {
        $expandedSource = Get-PageSource -SessionId $SessionId
        $visibleItems = @(Get-VisibleReferenceItems -Source $expandedSource)
        $visibleElements = @(Find-AppiumElements `
            -SessionId $SessionId `
            -ResourceId "$packageName`:id/tv_reference_content")
        $processedThisPass = $false

        for (
            $itemIndex = 0;
            $itemIndex -lt [math]::Min($visibleItems.Count, $visibleElements.Count);
            $itemIndex++
        ) {
            $item = $visibleItems[$itemIndex]
            $key = [string]$item.index
            if ($collected.ContainsKey($key)) {
                continue
            }

            $processedThisPass = $true
            $sourceResult = [ordered]@{
                index = [int]$item.index
                title = [string]$item.title
                page_title = $null
                domain = $null
                url = $null
                raw_url = $null
                status = "failed"
                error_message = $null
            }
            try {
                Invoke-ElementClick `
                    -SessionId $SessionId `
                    -ElementId $visibleElements[$itemIndex]
                $shareButton = Find-AppiumElement `
                    -SessionId $SessionId `
                    -ResourceId "$packageName`:id/btn_share" `
                    -TimeoutSeconds 15

                $pageTitleElement = Find-AppiumElement `
                    -SessionId $SessionId `
                    -ResourceId "$packageName`:id/tv_title" `
                    -TimeoutSeconds 3 `
                    -Optional
                if ($pageTitleElement) {
                    $sourceResult.page_title = Get-ElementText `
                        -SessionId $SessionId `
                        -ElementId $pageTitleElement
                }

                $clipboardMarker = "mobile-gateway-$([guid]::NewGuid().ToString('N'))"
                try {
                    Set-ClipboardText -SessionId $SessionId -Value $clipboardMarker
                } catch {
                    $clipboardMarker = $null
                }
                Invoke-ElementClick -SessionId $SessionId -ElementId $shareButton
                $shareItems = @(Wait-AppiumElements `
                    -SessionId $SessionId `
                    -ResourceId "$packageName`:id/tv_app_name" `
                    -TimeoutSeconds 8)
                if ($shareItems.Count -eq 0) {
                    throw "Doubao share sheet does not expose Copy Link"
                }
                Invoke-ElementClick `
                    -SessionId $SessionId `
                    -ElementId $shareItems[0]
                Start-Sleep -Milliseconds 500

                $rawUrl = Get-ClipboardText -SessionId $SessionId
                if (
                    -not $rawUrl -or
                    ($clipboardMarker -and $rawUrl -eq $clipboardMarker)
                ) {
                    throw "Copy Link did not update the clipboard"
                }
                $uri = $null
                if (
                    -not [Uri]::TryCreate(
                        $rawUrl,
                        [UriKind]::Absolute,
                        [ref]$uri
                    ) -or
                    $uri.Scheme -notin @("http", "https")
                ) {
                    throw "Copied value is not an HTTP URL"
                }
                $canonicalUrl = ConvertTo-CanonicalSourceUrl -Url $rawUrl
                $canonicalUri = [Uri]$canonicalUrl
                $sourceResult.raw_url = $rawUrl
                $sourceResult.url = $canonicalUrl
                $sourceResult.domain = $canonicalUri.Host.ToLowerInvariant()
                $sourceResult.status = "collected"
            } catch {
                $sourceResult.error_message = $_.Exception.Message
            } finally {
                try {
                    Return-ToDoubaoChat -SessionId $SessionId
                    Expand-ReferenceList -SessionId $SessionId
                } catch {
                    if (-not $sourceResult.error_message) {
                        $sourceResult.error_message = $_.Exception.Message
                    }
                }
            }
            $collected[$key] = [pscustomobject]$sourceResult
            break
        }

        if ($processedThisPass) {
            $stalledScrolls = 0
            continue
        }

        $bounds = Get-ReferenceListBounds -Source $expandedSource
        if ($null -eq $bounds) {
            $stalledScrolls++
            continue
        }
        $scroll = Invoke-AppiumRequest `
            -Method Post `
            -Path "/session/$SessionId/execute/sync" `
            -Body @{
                script = "mobile: scrollGesture"
                args = @(@{
                    left = $bounds.left
                    top = $bounds.top
                    width = $bounds.width
                    height = $bounds.height
                    direction = "down"
                    percent = 0.85
                })
            }
        if (-not $scroll.value) {
            $stalledScrolls++
        } else {
            Start-Sleep -Milliseconds 500
            $stalledScrolls = 0
        }
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
                status = "failed"
                error_message = "Reference item was not exposed by the Doubao UI"
            }
        }
    }
    @{
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
        return $null
    }

    $latest = $assistantNodes[-1]
    $candidates = @()
    foreach ($node in @($latest.SelectNodes(".//*"))) {
        foreach ($attributeName in @("content-desc", "text")) {
            $value = $node.GetAttribute($attributeName)
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                $candidates += $value.Trim()
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
        completed = $true
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

    $startedAt = Get-Date
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
    Start-Sleep -Seconds 2

    if ($newConversation) {
        $newChatButton = $null
        for ($navigationAttempt = 0; $navigationAttempt -lt 5; $navigationAttempt++) {
            $newChatButton = Find-AppiumElement `
                -SessionId $sessionId `
                -ResourceId "$packageName`:id/right_img" `
                -TimeoutSeconds 2 `
                -Optional
            if ($newChatButton) {
                break
            }
            $backButton = Find-AppiumElement `
                -SessionId $sessionId `
                -ResourceId "$packageName`:id/back_icon" `
                -TimeoutSeconds 2 `
                -Optional
            if ($backButton) {
                Invoke-ElementClick -SessionId $sessionId -ElementId $backButton
            } else {
                Invoke-AppiumRequest `
                    -Method Post `
                    -Path "/session/$sessionId/back" `
                    -Body @{} | Out-Null
            }
            Start-Sleep -Seconds 1
        }
        if (-not $newChatButton) {
            throw "Could not navigate to the Doubao conversation list"
        }
        Invoke-ElementClick -SessionId $sessionId -ElementId $newChatButton
        Start-Sleep -Seconds 2
    }

    $inputElement = Find-AppiumElement `
        -SessionId $sessionId `
        -ResourceId "$packageName`:id/input_text" `
        -TimeoutSeconds 3 `
        -Optional
    if (-not $inputElement) {
        $textModeButton = Find-AppiumElement `
            -SessionId $sessionId `
            -ResourceId "$packageName`:id/action_input" `
            -TimeoutSeconds 10
        Invoke-ElementClick -SessionId $sessionId -ElementId $textModeButton
        $inputElement = Find-AppiumElement `
            -SessionId $sessionId `
            -ResourceId "$packageName`:id/input_text" `
            -TimeoutSeconds 10
    }

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$sessionId/element/$inputElement/clear" `
        -Body @{} | Out-Null
    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$sessionId/element/$inputElement/value" `
        -Body @{ text = $prompt; value = @($prompt) } | Out-Null

    $sendButton = Find-AppiumElement `
        -SessionId $sessionId `
        -ResourceId "$packageName`:id/action_send" `
        -TimeoutSeconds 10
    Invoke-ElementClick -SessionId $sessionId -ElementId $sendButton
    $sentAt = Get-Date

    $deadline = $sentAt.AddSeconds($timeoutSeconds)
    $firstTokenAt = $null
    $finalSource = $null
    $message = $null
    $responseRetryCount = 0
    do {
        Start-Sleep -Seconds 2
        $source = Get-PageSource -SessionId $sessionId
        if (
            $source.Contains($doubaoRetryMessage) -and
            $responseRetryCount -lt 2
        ) {
            $retryElement = Find-AppiumElementByXPath `
                -SessionId $sessionId `
                -XPath "//*[@text='$doubaoRetryMessage']" `
                -Optional
            if ($retryElement) {
                Invoke-ElementClick `
                    -SessionId $sessionId `
                    -ElementId $retryElement
                $responseRetryCount++
                Start-Sleep -Seconds 2
                continue
            }
        }
        if (
            $null -eq $firstTokenAt -and
            (Get-FirstAssistantText -Source $source -Prompt $prompt)
        ) {
            $firstTokenAt = Get-Date
        }
        $message = Get-AssistantMessage -Source $source
        if ($null -ne $message -and $message.completed) {
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
    $sourceCollectionStartedAt = Get-Date
    $sourceCollection = Get-DoubaoSources `
        -SessionId $sessionId `
        -AnswerSource $finalSource
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
    $screenshotResponse = Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$sessionId/screenshot" `
        -Body $null `
        -TimeoutSeconds 45
    $screenshotPath = Join-Path $taskResultDirectory "screenshot.png"
    [IO.File]::WriteAllBytes(
        $screenshotPath,
        [Convert]::FromBase64String([string]$screenshotResponse.value)
    )
    $screenshotHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $screenshotPath).Hash.ToLower()

    $versionLine = & adb -s $serial shell dumpsys package $packageName |
        Select-String "versionName=" |
        Select-Object -First 1
    $versionName = if ($versionLine) {
        ($versionLine.Line.Trim() -split "=", 2)[1]
    } else {
        $null
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
        sources = @($sourceCollection.sources)
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
