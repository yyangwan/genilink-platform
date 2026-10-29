# Offline-only policy. All device operations belong to the caller's callbacks.
function Get-CaptureGuardBounds {
    param([string]$Value)
    if ($Value -notmatch '^\[(\d{1,6}),(\d{1,6})\]\[(\d{1,6}),(\d{1,6})\]$') { return $null }
    $b = @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], [int]$Matches[4])
    if ($b[2] -le $b[0] -or $b[3] -le $b[1]) { return $null }
    return ,$b
}

function Get-CaptureDownloadCancellation {
    param($Dialog, [object[]]$Nodes)
    if ($Dialog.GetAttribute('package') -cne 'com.huawei.browser' -or
        $Dialog.SelectSingleNode("ancestor::*[@class='android.webkit.WebView']") -or
        $Dialog.SelectSingleNode(".//*[@class='android.webkit.WebView' or @password='true' or @class='android.widget.EditText']")) { return $null }
    $labels = @($Nodes | ForEach-Object { $_.GetAttribute('text').Trim() })
    if (@($Nodes | Where-Object { $_.GetAttribute('package') -cne 'com.huawei.browser' }).Count -or
        @($labels | Where-Object { $_ -match '^文件名\s*[:：]' }).Count -ne 1 -or
        @($labels | Where-Object { $_ -match '^大小\s*[:：]' }).Count -ne 1 -or
        @($labels | Where-Object { $_ -match '(?i)\.pdf$' }).Count -ne 1) { return $null }
    $title = @($Nodes | Where-Object { $_.GetAttribute('text') -ceq '下载' -and $_.GetAttribute('clickable') -ne 'true' -and $_.GetAttribute('class') -eq 'android.widget.TextView' })
    $cancel = @($Nodes | Where-Object { $_.GetAttribute('text') -ceq '取消' -and $_.GetAttribute('class') -eq 'android.widget.Button' -and $_.GetAttribute('clickable') -eq 'true' -and $_.GetAttribute('enabled') -eq 'true' })
    $confirm = @($Nodes | Where-Object { $_.GetAttribute('text') -ceq '下载' -and $_.GetAttribute('class') -eq 'android.widget.Button' -and $_.GetAttribute('clickable') -eq 'true' -and $_.GetAttribute('enabled') -eq 'true' })
    if ($title.Count -ne 1 -or $cancel.Count -ne 1 -or $confirm.Count -ne 1) { return $null }
    $panel = Get-CaptureGuardBounds $Dialog.GetAttribute('bounds')
    $bounds = Get-CaptureGuardBounds $cancel[0].GetAttribute('bounds')
    $positive = Get-CaptureGuardBounds $confirm[0].GetAttribute('bounds')
    if (-not $panel -or -not $bounds -or -not $positive -or
        $bounds[0] -lt $panel[0] -or $bounds[1] -lt $panel[1] -or $bounds[2] -gt $panel[2] -or $bounds[3] -gt $panel[3] -or
        $positive[0] -lt $panel[0] -or $positive[1] -lt $panel[1] -or $positive[2] -gt $panel[2] -or $positive[3] -gt $panel[3]) { return $null }
    [pscustomobject]@{Kind='source_download';Reason='';X=[int][math]::Floor(($bounds[0]+$bounds[2])/2);Y=[int][math]::Floor(($bounds[1]+$bounds[3])/2)}
}

function Get-CaptureInterruption {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Source,
        [Parameter(Mandatory)][string]$ExpectedPackage,
        [switch]$AllowSourceDownload
    )
    $result = @{ Kind = 'none'; Reason = ''; X = $null; Y = $null }
    $reader = $null
    $inputReader = $null
    try {
        $settings = New-Object System.Xml.XmlReaderSettings
        $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $settings.XmlResolver = $null
        $settings.MaxCharactersInDocument = 8388608
        $inputReader = New-Object System.IO.StringReader($Source)
        $reader = [System.Xml.XmlReader]::Create($inputReader, $settings)
        $document = New-Object System.Xml.XmlDocument
        $document.XmlResolver = $null
        $document.Load($reader)
        if ($null -eq $document.DocumentElement -or $document.DocumentElement.Name -ne 'hierarchy') {
            throw 'Invalid hierarchy'
        }
    } catch {
        $result.Kind = 'manual'; $result.Reason = 'unreadable_hierarchy'
        return [pscustomobject]$result
    } finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $inputReader) { $inputReader.Dispose() }
    }

    $boundaries = @()
    foreach ($node in $document.SelectNodes('//*')) {
        $class = $node.GetAttribute('class')
        $id = $node.GetAttribute('resource-id')
        $yuanbaoBoundary = $ExpectedPackage -ceq 'com.tencent.hunyuan.app.chat' -and
            $node.GetAttribute('package') -ceq $ExpectedPackage -and $class -eq 'android.widget.FrameLayout' -and
            $null -ne $node.SelectSingleNode("./*[@resource-id='com.tencent.hunyuan.app.chat:id/title' and @text='元宝新版本']")
        if ($yuanbaoBoundary -or $class -in @('android.app.Dialog', 'android.widget.Dialog', 'androidwidgetDialog') -or
            $id -eq 'android:id/parentPanel' -or
            $id -match '^[^:]+:id/(?:[a-z0-9_]*(?:update|upgrade)[a-z0-9_]*dialog[a-z0-9_]*|[a-z0-9_]*dialog[a-z0-9_]*(?:update|upgrade)[a-z0-9_]*)$') {
            $boundaries += $node
        }
    }

    # System permission controllers are protected even when not exposed as Dialog.
    foreach ($node in $document.SelectNodes('//*[@resource-id]')) {
        if ($node.GetAttribute('resource-id') -match '^(?:com\.android\.permissioncontroller|com\.google\.android\.permissioncontroller|com\.android\.packageinstaller):id/(?:permission_|grant_dialog)') {
            $result.Kind = 'manual'; $result.Reason = 'protected_dialog'
            return [pscustomobject]$result
        }
    }

    # Protected content wins across all windows, including outer dialog wrappers.
    foreach ($dialog in $boundaries) {
        foreach ($node in (@($dialog) + @($dialog.SelectNodes('.//*')))) {
            foreach ($attribute in @('text', 'content-desc')) {
                if ($node.GetAttribute($attribute) -match '(?:登录|登陆|注册|用户协议|隐私|同意|授权|权限|支付|付款|充值|验证|验证码|实名认证|sign[ -]?in|log[ -]?in|consent|agreement|permission|payment|verify|verification)') {
                    $result.Kind = 'manual'; $result.Reason = 'protected_dialog'
                    return [pscustomobject]$result
                }
            }
        }
    }

    $candidates = @()
    foreach ($dialog in $boundaries) {
        # Nested standard wrappers describe one dialog; classify its innermost boundary.
        $hasInner = $false
        foreach ($other in $boundaries) {
            if ([object]::ReferenceEquals($other, $dialog)) { continue }
            $ancestor = $other.ParentNode
            while ($null -ne $ancestor) {
                if ([object]::ReferenceEquals($ancestor, $dialog)) { $hasInner = $true; break }
                $ancestor = $ancestor.ParentNode
            }
            if ($hasInner) { break }
        }
        if ($hasInner) { continue }
        $nodes = @($dialog) + @($dialog.SelectNodes('.//*'))
        if ($AllowSourceDownload -and $ExpectedPackage -ceq 'com.larus.nova') {
            $download = Get-CaptureDownloadCancellation -Dialog $dialog -Nodes $nodes
            if ($download) { $candidates += $download; continue }
        }
        $yuanbaoPanel = $ExpectedPackage -ceq 'com.tencent.hunyuan.app.chat' -and
            $dialog.GetAttribute('package') -ceq $ExpectedPackage -and
            @($dialog.SelectNodes("./*[@resource-id='com.tencent.hunyuan.app.chat:id/title' and @text='元宝新版本']")).Count -eq 1 -and
            @($dialog.SelectNodes("./*[@resource-id='com.tencent.hunyuan.app.chat:id/version']") | Where-Object { $_.GetAttribute('text') -match '^新版本\s+v\d+(?:\.\d+)+$' }).Count -eq 1 -and
            @($dialog.SelectNodes("./*[@resource-id='com.tencent.hunyuan.app.chat:id/upgrade' and @text='立即更新' and @clickable='true' and @enabled='true']")).Count -eq 1
        $labels = @()
        $titles = @()
        $upgradeText = $false
        foreach ($node in $nodes) {
            foreach ($attribute in @('text', 'content-desc')) {
                $label = $node.GetAttribute($attribute).Trim()
                if ($label) { $labels += $label }
                if ($node.GetAttribute('clickable') -ne 'true' -and $node.GetAttribute('class') -notmatch '(?:EditText|Button)$' -and
                    ($label -match '^(?:发现新版本|检测到新版本|新版本更新|版本更新|软件更新|应用更新|升级提醒|更新提醒|New version available|Update available|App update|Software update)$' -or
                        ($yuanbaoPanel -and $node.GetAttribute('resource-id') -ceq 'com.tencent.hunyuan.app.chat:id/title' -and $label -ceq '元宝新版本'))) {
                    $upgradeText = $true
                    if ($node.GetAttribute('resource-id') -match ':id/(?:title|alertTitle|dialog_title|update_title|upgrade_title|updateTitle|upgradeTitle)$') {
                        $titles += $node
                    }
                }
            }
        }
        if ($titles.Count -eq 0) {
            # Exact panel titles must be structural titles, never answer/body text.
            $intentional = $false
            foreach ($node in $nodes) {
                if ($node.GetAttribute('resource-id') -match '(?:^android:id/(?:alertTitle|title)$|:id/(?:reference|references|source|sources|share)_(?:panel|sheet|title)$)' -and
                    $node.GetAttribute('text') -match '^(?:参考资料|参考来源|引用来源|信息来源|来源|全部来源|搜索来源|分享|分享到|分享至|References|Sources|Share|Share with)$') {
                    $intentional = $true
                }
            }
            if ($intentional) { continue }
            $result.Kind = 'manual'
            $result.Reason = if ($upgradeText) { 'upgrade_without_safe_action' } else { 'unknown_dialog' }
            return [pscustomobject]$result
        }
        $safe = @()
        $dialogBounds = Get-CaptureGuardBounds $dialog.GetAttribute('bounds')
        $packageOK = $dialog.GetAttribute('package') -ceq $ExpectedPackage
        # Web content must not impersonate a trusted native upgrade dialog.
        if ($dialog.SelectSingleNode("ancestor::*[@class='android.webkit.WebView']") -or
            $dialog.SelectSingleNode(".//*[@class='android.webkit.WebView']")) { $packageOK = $false }
        foreach ($node in $nodes) {
            $package = $node.GetAttribute('package')
            if ($package -and $package -cne $ExpectedPackage) { $packageOK = $false }
        }
        foreach ($title in $titles) {
            if ($title.GetAttribute('package') -cne $ExpectedPackage) { $packageOK = $false }
        }
        foreach ($node in $nodes) {
            $decline = $node.GetAttribute('text') -cmatch '^(?:暂不升级|暂不更新|稍后提示|稍后提醒|稍后再说|以后再说|取消|关闭)$'
            $yuanbaoSkip = $yuanbaoPanel -and $node.GetAttribute('resource-id') -ceq 'com.tencent.hunyuan.app.chat:id/skip' -and
                $node.GetAttribute('class') -ceq 'android.widget.ImageView' -and $node.GetAttribute('text') -ceq ''
            $button = $node.GetAttribute('class') -in @('android.widget.Button', 'android.widget.ImageButton') -or
                $node.GetAttribute('resource-id') -match ':id/(?:button2|cancel|close|decline|later|negative_button|btn_cancel|btn_close|update_cancel|upgrade_cancel)$'
            $bounds = Get-CaptureGuardBounds $node.GetAttribute('bounds')
            if ((($decline -and $button) -or $yuanbaoSkip) -and $packageOK -and $node.GetAttribute('package') -ceq $ExpectedPackage -and
                $node.GetAttribute('enabled') -ceq 'true' -and $node.GetAttribute('clickable') -ceq 'true' -and
                $null -ne $bounds -and $null -ne $dialogBounds -and
                $bounds[0] -ge $dialogBounds[0] -and $bounds[1] -ge $dialogBounds[1] -and
                $bounds[2] -le $dialogBounds[2] -and $bounds[3] -le $dialogBounds[3]) {
                $safe += ,$bounds
            }
        }
        if (-not $packageOK -or $safe.Count -ne 1 -or
            @($labels | Where-Object { $_ -match '(?:强制升级|强制更新|必须升级|必须更新|forced update|mandatory update)' }).Count -gt 0) {
            $result.Kind = 'manual'; $result.Reason = 'upgrade_without_safe_action'
            return [pscustomobject]$result
        }
        $b = $safe[0]
        $candidates += [pscustomobject]@{ Kind = 'upgrade'; Reason = ''; X = [int][math]::Floor(($b[0] + $b[2]) / 2); Y = [int][math]::Floor(($b[1] + $b[3]) / 2) }
    }
    if ($candidates.Count -eq 1) { return $candidates[0] }
    if ($candidates.Count -gt 1) { $result.Kind = 'manual'; $result.Reason = 'unknown_dialog' }
    return [pscustomobject]$result
}

function Stop-CaptureInterruption {
    param([string]$Source, [string]$Reason, [string]$Code, [scriptblock]$OnBlocked, [hashtable]$State)
    $State['CapturePopupBlocked'] = $Code
    if ($null -ne $OnBlocked) {
        try { & $OnBlocked $Source $Reason *> $null } catch { }
    }
    throw $Code
}

function Resolve-CaptureInterruptions {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Source,
        [Parameter(Mandatory)][scriptblock]$Refresh,
        [Parameter(Mandatory)][scriptblock]$Tap,
        [Parameter(Mandatory)][string]$ExpectedPackage,
        [Parameter(Mandatory)][hashtable]$State,
        [scriptblock]$OnBlocked,
        [scriptblock]$ResumeCheck
    )
    $ErrorActionPreference = 'Stop'
    if ($State.ContainsKey('CapturePopupBlocked')) {
        # Never re-enter capture after a blocked task, even if a caller swallowed it.
        $code = [string]$State['CapturePopupBlocked']
        if ($code -notin @('CAPTURE_POPUP_MANUAL_REQUIRED', 'CAPTURE_POPUP_RETRY_EXHAUSTED', 'CAPTURE_POPUP_RESUME_MISMATCH')) {
            $code = 'CAPTURE_POPUP_MANUAL_REQUIRED'
            $State['CapturePopupBlocked'] = $code
        }
        throw $code
    }
    # Task-owned state deliberately does not depend on hierarchy hashes or nonces.
    $counterKey = 'CapturePopupDismissals'
    if (-not $State.ContainsKey($counterKey)) { $State[$counterKey] = 0 }
    if ($State[$counterKey] -isnot [int] -or $State[$counterKey] -lt 0) {
        Stop-CaptureInterruption $Source 'retry_exhausted' 'CAPTURE_POPUP_RETRY_EXHAUSTED' $OnBlocked $State
    }
    $current = $Source
    $allowDownload = $State['SourceDownloadContext'] -is [bool] -and $State['SourceDownloadContext']
    while ($true) {
        $popup = Get-CaptureInterruption -Source $current -ExpectedPackage $ExpectedPackage -AllowSourceDownload:$allowDownload
        if ($popup.Kind -eq 'none') { return $current }
        if ($popup.Kind -eq 'manual') {
            Stop-CaptureInterruption $current $popup.Reason 'CAPTURE_POPUP_MANUAL_REQUIRED' $OnBlocked $State
        }
        if ($State[$counterKey] -ge 2) {
            Stop-CaptureInterruption $current 'retry_exhausted' 'CAPTURE_POPUP_RETRY_EXHAUSTED' $OnBlocked $State
        }
        $before = $current
        # Reserve budget before invoking device code, including failed attempts.
        $State[$counterKey]++
        try { & $Tap $popup.X $popup.Y *> $null } catch {
            Stop-CaptureInterruption $current 'upgrade_without_safe_action' 'CAPTURE_POPUP_MANUAL_REQUIRED' $OnBlocked $State
        }
        try {
            $fresh = @(& $Refresh)
            if ($fresh.Count -ne 1 -or $fresh[0] -isnot [string] -or [string]::IsNullOrWhiteSpace($fresh[0])) { throw 'Refresh failed' }
            $current = $fresh[0]
        } catch {
            Stop-CaptureInterruption $current 'refresh_failed' 'CAPTURE_POPUP_MANUAL_REQUIRED' $OnBlocked $State
        }
        $afterPopup = Get-CaptureInterruption -Source $current -ExpectedPackage $ExpectedPackage -AllowSourceDownload:$allowDownload
        if ($afterPopup.Kind -eq 'manual') {
            Stop-CaptureInterruption $current $afterPopup.Reason 'CAPTURE_POPUP_MANUAL_REQUIRED' $OnBlocked $State
        }
        if ($popup.Kind -eq 'source_download') {
            if ($afterPopup.Kind -ne 'none') {
                Stop-CaptureInterruption $current 'refresh_failed' 'CAPTURE_POPUP_MANUAL_REQUIRED' $OnBlocked $State
            }
            # The source collector owns the return to its answer/reference
            # panel. A browser screen is never resumed as answer content.
            throw 'CAPTURE_SOURCE_DOWNLOAD'
        }
        if ($null -ne $ResumeCheck) {
            $same = $false
            try {
                $checks = @(& $ResumeCheck $before $current)
                $same = $checks.Count -eq 1 -and $checks[0] -is [bool] -and $checks[0]
            } catch { }
            if (-not $same) {
                Stop-CaptureInterruption $current 'resume_mismatch' 'CAPTURE_POPUP_RESUME_MISMATCH' $OnBlocked $State
            }
        }
    }
}
