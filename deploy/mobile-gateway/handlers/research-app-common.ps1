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

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/execute/sync" `
        -Body @{
            script = "mobile: clickGesture"
            args = @(@{ x = $X; y = $Y })
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

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/back" `
        -Body @{} | Out-Null
}

function Get-PageSource {
    param([Parameter(Mandatory)][string]$SessionId)

    [string](Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$SessionId/source" `
        -Body $null `
        -TimeoutSeconds 45).value
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

    switch ($Platform) {
        "deepseek" {
            for ($attempt = 0; $attempt -lt 5; $attempt++) {
                $button = Find-Element `
                    -SessionId $SessionId `
                    -Using "xpath" `
                    -Value "//*[@content-desc='开启新对话']" `
                    -TimeoutSeconds 2 `
                    -Optional
                if ($button) {
                    Click-Element -SessionId $SessionId -ElementId $button
                    break
                }
                Press-Back -SessionId $SessionId
                Start-Sleep -Seconds 1
            }
            if (-not $button) {
                throw "Could not return DeepSeek to a conversation screen"
            }
        }
        "yuanbao" {
            for ($attempt = 0; $attempt -lt 5; $attempt++) {
                $button = Find-Element `
                    -SessionId $SessionId `
                    -Using "xpath" `
                    -Value "//*[@content-desc='新建对话']" `
                    -TimeoutSeconds 2 `
                    -Optional
                if ($button) {
                    Click-Element -SessionId $SessionId -ElementId $button
                    break
                }
                Press-Back -SessionId $SessionId
                Start-Sleep -Seconds 1
            }
            if (-not $button) {
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
            Click-Point -SessionId $SessionId -X 550 -Y 2100
            Start-Sleep -Seconds 1
            $input = Find-Element `
                -SessionId $SessionId `
                -Using "class name" `
                -Value "android.widget.EditText"
        }
        "yuanbao" {
            $input = Find-Element `
                -SessionId $SessionId `
                -Using "id" `
                -Value "$packageName`:id/edConversationInput"
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

    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/element/$input/clear" `
        -Body @{} | Out-Null
    Invoke-AppiumRequest `
        -Method Post `
        -Path "/session/$SessionId/element/$input/value" `
        -Body @{ text = $Prompt; value = @($Prompt) } | Out-Null
    Start-Sleep -Seconds 1

    switch ($Platform) {
        "deepseek" {
            $send = Find-Element `
                -SessionId $SessionId `
                -Using "xpath" `
                -Value "//*[@content-desc='发送']"
        }
        "yuanbao" {
            $send = Find-Element `
                -SessionId $SessionId `
                -Using "id" `
                -Value "$packageName`:id/fl_slot_send_stop"
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
                if ($text -match "已阅读\s*(\d+)\s*个网页") {
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
        if ($Platform -eq "deepseek") {
            $explicitComplete = $source -match "content-desc=`"复制`""
        } elseif ($Platform -eq "yuanbao") {
            $explicitComplete = $source -match "复制本次模型回答"
        } else {
            $explicitComplete = $info.reference_count -gt 0 -and $stableCount -ge 1
        }
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

function Get-DeepSeekSources {
    param(
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][int]$ReferenceCount
    )

    $marker = Find-Element `
        -SessionId $SessionId `
        -Using "xpath" `
        -Value "//*[@text='已阅读 $ReferenceCount 个网页']"
    Click-Element -SessionId $SessionId -ElementId $marker
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
                $open = Find-Element `
                    -SessionId $SessionId `
                    -Using "xpath" `
                    -Value "//*[@content-desc='在浏览器中打开']" `
                    -TimeoutSeconds 12
                $pageSource = Get-PageSource -SessionId $SessionId
                $pageDocument = ConvertTo-Xml -Source $pageSource
                $pageTitleNode = $pageDocument.SelectSingleNode(
                    "//*[@class='android.widget.TextView' and @text]"
                )
                if ($pageTitleNode) {
                    $record.page_title = $pageTitleNode.GetAttribute("text")
                }
                Click-Element -SessionId $SessionId -ElementId $open
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
                Press-Back -SessionId $SessionId
                Start-Sleep -Milliseconds 500
                Return-ToDeepSeekSourcePanel -SessionId $SessionId
            } catch {
                $record.status = "failed"
                $record.error_message = $_.Exception.Message
                try {
                    Invoke-AppiumRequest `
                        -Method Post `
                        -Path "/session/$SessionId/execute/sync" `
                        -Body @{
                            script = "mobile: activateApp"
                            args = @(@{ appId = $packageName })
                        } | Out-Null
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
        $marker = Find-Element `
            -SessionId $SessionId `
            -Using "xpath" `
            -Value "//*[@text='源']"
        Click-Element -SessionId $SessionId -ElementId $marker
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
            $url = if ($domain) { "https://$domain/" } else { $null }
            $resolution = if ($url) { "site_root" } else { "unavailable" }
            $collected[[string]$index] = New-SourceRecord `
                -Index $index `
                -Title $title `
                -SiteName $siteName `
                -Domain $domain `
                -Url $url `
                -Resolution $resolution
            $foundNew = $true
        }
        if ($collected.Count -ge $ReferenceCount) {
            break
        }
        if (-not $foundNew -and -not (Scroll-Region `
            -SessionId $SessionId `
            -Top 850 `
            -Height 1450
        )) {
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
try {
    $task = $TaskJson | ConvertFrom-Json
    if (-not $task.id) {
        throw "Task JSON must include id"
    }
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
    Start-Sleep -Seconds 2

    $newConversation = $true
    if ($null -ne $task.payload.new_conversation) {
        $newConversation = [bool]$task.payload.new_conversation
    }
    if ($newConversation) {
        Start-NewConversation -SessionId $sessionId
    }

    Submit-Prompt -SessionId $sessionId -Prompt $prompt
    $sentAt = Get-Date
    $answerInfo = Wait-ForAnswer `
        -SessionId $sessionId `
        -Prompt $prompt `
        -TimeoutSeconds $timeoutSeconds
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
    $screenshotResponse = Invoke-AppiumRequest `
        -Method Get `
        -Path "/session/$sessionId/screenshot" `
        -Body $null
    $screenshotPath = Join-Path $taskResultDirectory "screenshot.png"
    [IO.File]::WriteAllBytes(
        $screenshotPath,
        [Convert]::FromBase64String([string]$screenshotResponse.value)
    )

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
    if ($sessionId) {
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
