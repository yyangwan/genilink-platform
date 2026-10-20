$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'gateway-popup-guard.ps1')

$script:checks = 0
function Assert-Guard {
    param([bool]$Condition, [string]$Name)
    if (-not $Condition) { throw "FAIL: $Name" }
    $script:checks++
}
function New-GuardNode {
    param([string]$Text, [string]$Id = '', [string]$Bounds = '[20,120][100,160]',
        [string]$Package = 'test.app', [string]$Enabled = 'true', [string]$Clickable = 'false', [string]$Class = '')
    $escaped = [System.Security.SecurityElement]::Escape($Text)
    if (-not $Class) { $Class = if ($Clickable -eq 'true') { 'android.widget.Button' } else { 'android.widget.TextView' } }
    return "<node text='$escaped' resource-id='$Id' bounds='$Bounds' package='$Package' enabled='$Enabled' clickable='$Clickable' class='$Class' />"
}
function New-GuardDialog {
    param([string]$Body, [string]$Package = 'test.app', [string]$Class = 'android.app.Dialog',
        [string]$Id = '', [string]$Bounds = '[10,100][300,500]')
    return "<hierarchy><node class='$Class' resource-id='$Id' package='$Package' bounds='$Bounds'>$Body</node></hierarchy>"
}
function Get-GuardClassification {
    param([string]$Xml)
    return Get-CaptureInterruption -Source $Xml -ExpectedPackage 'test.app'
}
function Assert-GuardBlocked {
    param([string]$Xml, [string]$Reason, [string]$Code = 'CAPTURE_POPUP_MANUAL_REQUIRED',
        [hashtable]$State = @{}, [scriptblock]$Refresh = { $script:normal }, [scriptblock]$ResumeCheck)
    $events = New-Object System.Collections.ArrayList
    $taps = New-Object System.Collections.ArrayList
    $blocked = { param($source, $why) [void]$events.Add(@($why, $State['CapturePopupBlocked'])); throw 'evidence callback failed: secret popup text' }.GetNewClosure()
    $tap = { param($x, $y) [void]$taps.Add(@($x, $y)) }.GetNewClosure()
    $caught = ''
    try {
        $null = Resolve-CaptureInterruptions -Source $Xml -ExpectedPackage 'test.app' -State $State `
            -Refresh $Refresh -Tap $tap -OnBlocked $blocked -ResumeCheck $ResumeCheck
    } catch { $caught = $_.Exception.Message }
    Assert-Guard ($caught -ceq $Code) "primary controlled error: $Reason"
    Assert-Guard ($events.Count -eq 1 -and $events[0][0] -ceq $Reason) "callback before throw: $Reason"
    Assert-Guard ($events[0][1] -ceq $Code -and $State['CapturePopupBlocked'] -ceq $Code) "blocked state set before callback: $Reason"
    return $taps.Count
}

$script:normal = '<hierarchy><node package="test.app" text="answer" /></hierarchy>'
$title = New-GuardNode '发现新版本' 'test.app:id/title'
$decline = New-GuardNode '暂不升级' 'test.app:id/decline' '[20,400][100,460]' -Clickable 'true'
$upgrade = New-GuardDialog ($title + $decline)
$p = Get-GuardClassification $upgrade
Assert-Guard ($p.Kind -eq 'upgrade' -and $p.X -eq 60 -and $p.Y -eq 430) 'verified upgrade coordinates'
$webUpgrade = '<hierarchy><node class="android.webkit.WebView">' + $upgrade.Replace('<hierarchy>', '').Replace('</hierarchy>', '') + '</node></hierarchy>'
Assert-Guard ((Get-GuardClassification $webUpgrade).Kind -eq 'manual') 'web content cannot impersonate a native upgrade dialog'
$tapLog = New-Object System.Collections.ArrayList
$state = @{}
$tap = { param($x, $y) [void]$tapLog.Add(@($x, $y)) }.GetNewClosure()
$output = @(Resolve-CaptureInterruptions -Source $upgrade -Refresh { $script:normal } -Tap $tap -ExpectedPackage 'test.app' -State $state)
Assert-Guard ($output.Count -eq 1 -and $output[0] -ceq $script:normal) 'returns only fresh XML'
Assert-Guard ($tapLog.Count -eq 1 -and $state.CapturePopupDismissals -eq 1) 'fake upgrade closed once'

foreach ($label in @('暂不升级', '暂不更新', '稍后提示', '稍后提醒', '稍后再说', '以后再说', '取消', '关闭')) {
    $xml = New-GuardDialog ($title + (New-GuardNode $label -Clickable 'true'))
    Assert-Guard ((Get-GuardClassification $xml).Kind -eq 'upgrade') "decline allowlist: $label"
}
$globalCancel = New-GuardNode '取消' -Clickable 'true'
$xml = $upgrade.Replace('</hierarchy>', "$globalCancel</hierarchy>")
Assert-Guard ((Get-GuardClassification $xml).X -eq 60) 'global cancel cannot replace scoped target'
$xml = (New-GuardDialog $title).Replace('</hierarchy>', "$globalCancel</hierarchy>")
Assert-Guard ((Assert-GuardBlocked $xml 'upgrade_without_safe_action') -eq 0) 'global cancel untouched'
$quote = '<hierarchy>' + (New-GuardNode '答案引用：发现新版本，请取消升级。') + $globalCancel + '</hierarchy>'
Assert-Guard ((Get-GuardClassification $quote).Kind -eq 'none') 'upgrade quote in answer ignored'
$answerInDialog = New-GuardDialog ((New-GuardNode '发现新版本' 'test.app:id/answer') + $decline)
Assert-Guard ((Assert-GuardBlocked $answerInDialog 'upgrade_without_safe_action') -eq 0) 'answer text is not a title'
Assert-Guard ((Get-GuardClassification ('<hierarchy>' + $title + $decline + '</hierarchy>')).Kind -eq 'none') 'upgrade text without boundary ignored'

foreach ($label in @('请登录', '用户协议', '需要权限', '支付验证', '验证码', 'Sign in', 'Consent', 'Payment')) {
    $xml = New-GuardDialog ((New-GuardNode $label) + $decline)
    Assert-Guard ((Assert-GuardBlocked $xml 'protected_dialog') -eq 0) "protected dialog never tapped: $label"
}
$permission = '<hierarchy><node resource-id="com.android.permissioncontroller:id/permission_message" text="Allow?" /></hierarchy>'
Assert-Guard ((Assert-GuardBlocked $permission 'protected_dialog') -eq 0) 'system permission controller protected'
$multiWindow = (New-GuardDialog (New-GuardNode 'Unknown')).Replace('</hierarchy>', (New-GuardDialog (New-GuardNode '请登录')).Replace('<hierarchy>', '').Replace('</hierarchy>', '') + '</hierarchy>')
Assert-Guard ((Assert-GuardBlocked $multiWindow 'protected_dialog') -eq 0) 'protected window wins over earlier unknown window'
$nestedProtected = New-GuardDialog ((New-GuardNode '请登录') + $upgrade.Replace('<hierarchy>', '').Replace('</hierarchy>', ''))
Assert-Guard ((Assert-GuardBlocked $nestedProtected 'protected_dialog') -eq 0) 'outer protected wrapper cannot be skipped'
$forced = New-GuardDialog ($title + (New-GuardNode '必须更新') + $decline)
Assert-Guard ((Assert-GuardBlocked $forced 'upgrade_without_safe_action') -eq 0) 'forced update never tapped'
Assert-Guard ((Assert-GuardBlocked (New-GuardDialog $title) 'upgrade_without_safe_action') -eq 0) 'missing decline blocked'
$wrong = $upgrade.Replace('test.app', 'other.app')
Assert-Guard ((Assert-GuardBlocked $wrong 'upgrade_without_safe_action') -eq 0) 'wrong package never tapped'
$mixed = New-GuardDialog ($title + $decline.Replace('test.app', 'other.app'))
Assert-Guard ((Assert-GuardBlocked $mixed 'upgrade_without_safe_action') -eq 0) 'foreign child never tapped'
foreach ($bounds in @('', 'bad', '[100,120][20,160]', '[-1,120][100,160]', '[0,0][999,999]', '[20,120][20,160]', '[99999999999,0][999999999999,1]')) {
    $xml = New-GuardDialog ($title + (New-GuardNode '取消' -Bounds $bounds -Clickable 'true'))
    Assert-Guard ((Assert-GuardBlocked $xml 'upgrade_without_safe_action') -eq 0) 'invalid or out-of-dialog bounds never tapped'
}
$disabled = New-GuardDialog ($title + (New-GuardNode '取消' -Enabled 'false' -Clickable 'true'))
Assert-Guard ((Assert-GuardBlocked $disabled 'upgrade_without_safe_action') -eq 0) 'disabled decline never tapped'
$notClickable = New-GuardDialog ($title + (New-GuardNode '取消'))
Assert-Guard ((Assert-GuardBlocked $notClickable 'upgrade_without_safe_action') -eq 0) 'answer-like decline never tapped'
$clickableAnswer = New-GuardDialog ($title + (New-GuardNode '取消' 'test.app:id/answer' -Clickable 'true' -Class 'android.widget.TextView'))
Assert-Guard ((Assert-GuardBlocked $clickableAnswer 'upgrade_without_safe_action') -eq 0) 'clickable answer text never tapped'
$ambiguous = New-GuardDialog ($title + $decline + (New-GuardNode '关闭' -Clickable 'true'))
Assert-Guard ((Assert-GuardBlocked $ambiguous 'upgrade_without_safe_action') -eq 0) 'multiple decline targets blocked'
foreach ($class in @('android.widget.Dialog', 'androidwidgetDialog')) {
    Assert-Guard ((Get-GuardClassification (New-GuardDialog ($title + $decline) -Class $class)).Kind -eq 'upgrade') 'standard dialog class'
}
foreach ($id in @('android:id/parentPanel', 'test.app:id/update_dialog', 'test.app:id/dialog_upgrade')) {
    Assert-Guard ((Get-GuardClassification (New-GuardDialog ($title + $decline) -Class 'android.widget.FrameLayout' -Id $id)).Kind -eq 'upgrade') 'scoped dialog boundary'
}
$unknown = New-GuardDialog (New-GuardNode 'Something unexpected')
Assert-Guard ((Assert-GuardBlocked $unknown 'unknown_dialog') -eq 0) 'unknown native dialog blocked'
foreach ($xml in @('', '<hierarchy><node>', '<unrelated />', '<!DOCTYPE hierarchy [<!ENTITY x SYSTEM "file:///should-not-be-read">]><hierarchy>&x;</hierarchy>')) {
    Assert-Guard ((Assert-GuardBlocked $xml 'unreadable_hierarchy') -eq 0) 'unreadable hierarchy fails closed'
}

$state = @{}
$budgetLog = New-Object System.Collections.ArrayList
$budgetTap = { param($x, $y) [void]$budgetLog.Add(1) }.GetNewClosure()
foreach ($nonce in @('one', 'two')) {
    $xml = $upgrade.Replace('<hierarchy>', "<hierarchy nonce='$nonce'>")
    $null = Resolve-CaptureInterruptions -Source $xml -Refresh { $script:normal } -Tap $budgetTap -ExpectedPackage 'test.app' -State $state
}
$xml = $upgrade.Replace('<hierarchy>', '<hierarchy nonce="three">')
Assert-Guard ((Assert-GuardBlocked $xml 'retry_exhausted' 'CAPTURE_POPUP_RETRY_EXHAUSTED' -State $state) -eq 0) 'third popup blocked across calls and changed nonce'
Assert-Guard ($budgetLog.Count -eq 2 -and $state.CapturePopupDismissals -eq 2) 'task budget retained'
$repeat = { $upgrade }.GetNewClosure()
Assert-Guard ((Assert-GuardBlocked $upgrade 'retry_exhausted' 'CAPTURE_POPUP_RETRY_EXHAUSTED' -Refresh $repeat) -eq 2) 'persistent popup capped at two'
Assert-Guard ((Assert-GuardBlocked $upgrade 'resume_mismatch' 'CAPTURE_POPUP_RESUME_MISMATCH' -ResumeCheck { param($Before, $After) $false }) -eq 1) 'context mismatch stops after refresh'
Assert-Guard ((Assert-GuardBlocked $upgrade 'resume_mismatch' 'CAPTURE_POPUP_RESUME_MISMATCH' -ResumeCheck { throw 'private context' }) -eq 1) 'resume exception sanitized'
$resume = { param($Before, $After) ($Before -ceq $upgrade -and $After -ceq $script:normal) }.GetNewClosure()
$resumed = Resolve-CaptureInterruptions -Source $upgrade -Refresh { $script:normal } -Tap { param($x, $y) } -ExpectedPackage 'test.app' -State @{} -ResumeCheck $resume
Assert-Guard ($resumed -ceq $script:normal) 'resume callback receives before and fresh after'
Assert-Guard ((Assert-GuardBlocked $upgrade 'refresh_failed' -Refresh { throw 'private refresh error' }) -eq 1) 'refresh failure controlled'
Assert-Guard ((Assert-GuardBlocked $upgrade 'refresh_failed' -Refresh { }) -eq 1) 'empty refresh fails closed'
Assert-Guard ((Assert-GuardBlocked $upgrade 'refresh_failed' -Refresh { Write-Error 'private refresh error'; $script:normal }) -eq 1) 'nonterminating refresh error fails closed'
Assert-Guard ((Assert-GuardBlocked $upgrade 'unreadable_hierarchy' -Refresh { '<hierarchy>' }) -eq 1) 'malformed refresh fails closed'
$loginAfter = { New-GuardDialog (New-GuardNode '请登录') }
Assert-Guard ((Assert-GuardBlocked $upgrade 'protected_dialog' -Refresh $loginAfter -ResumeCheck { $false }) -eq 1) 'protected refreshed hierarchy takes precedence over resume mismatch'

foreach ($entry in @(@('参考资料', 'test.app:id/reference_title'), @('来源', 'test.app:id/source_panel'), @('分享', 'android:id/alertTitle'))) {
    $panel = New-GuardDialog (New-GuardNode $entry[0] $entry[1])
    Assert-Guard ((Get-GuardClassification $panel).Kind -eq 'none') 'intentional panel retained'
    $returned = Resolve-CaptureInterruptions -Source $panel -Refresh { throw 'must not refresh' } -Tap { throw 'must not tap' } -ExpectedPackage 'test.app' -State @{}
    Assert-Guard ($returned -ceq $panel) 'intentional panel returned unchanged'
}
$fakePanel = New-GuardDialog (New-GuardNode '参考资料')
Assert-Guard ((Get-GuardClassification $fakePanel).Reason -eq 'unknown_dialog') 'panel word alone not sufficient'
$referenceWithQuote = New-GuardDialog ((New-GuardNode '参考资料' 'test.app:id/reference_title') + (New-GuardNode '发现新版本' 'test.app:id/answer') + $decline)
Assert-Guard ((Get-GuardClassification $referenceWithQuote).Kind -eq 'none') 'reference answer upgrade quote retained without action'
$sheet = '<hierarchy><node class="android.widget.FrameLayout" resource-id="test.app:id/bottom_sheet" text="normal panel" /></hierarchy>'
Assert-Guard ((Get-GuardClassification $sheet).Kind -eq 'none') 'arbitrary bottom sheet not classified'
$tapFailureState = @{}
$tapFailureEvents = New-Object System.Collections.ArrayList
$onTapFailure = { param($Source, $Reason) [void]$tapFailureEvents.Add($Reason) }.GetNewClosure()
$tapError = ''
try {
    $null = Resolve-CaptureInterruptions -Source $upgrade -ExpectedPackage 'test.app' -State $tapFailureState `
        -Tap { Write-Error 'private tap error' } -Refresh { throw 'must not refresh after failed tap' } -OnBlocked $onTapFailure
} catch { $tapError = $_.Exception.Message }
Assert-Guard ($tapError -ceq 'CAPTURE_POPUP_MANUAL_REQUIRED') 'tap failure sanitized'
Assert-Guard ($tapFailureState.CapturePopupDismissals -eq 1 -and $tapFailureEvents[0] -eq 'upgrade_without_safe_action') 'failed tap reserves budget and reports reason'
Assert-Guard ($tapFailureState['CapturePopupBlocked'] -ceq 'CAPTURE_POPUP_MANUAL_REQUIRED') 'tap failure sets sticky block'
foreach ($code in @('CAPTURE_POPUP_MANUAL_REQUIRED', 'CAPTURE_POPUP_RETRY_EXHAUSTED', 'CAPTURE_POPUP_RESUME_MISMATCH')) {
    $sticky = @{ CapturePopupBlocked = $code; CapturePopupDismissals = 1 }
    $stickyError = ''
    $stickyCalls = New-Object System.Collections.ArrayList
    $unexpected = { [void]$stickyCalls.Add('unexpected'); throw 'must not run' }.GetNewClosure()
    try {
        $null = Resolve-CaptureInterruptions -Source $script:normal -ExpectedPackage 'test.app' -State $sticky `
            -Refresh $unexpected -Tap $unexpected -OnBlocked $unexpected -ResumeCheck $unexpected
    } catch { $stickyError = $_.Exception.Message }
    Assert-Guard ($stickyError -ceq $code -and $stickyCalls.Count -eq 0) 'persisted block rethrows without callbacks on normal fresh input'
    Assert-Guard ($sticky.CapturePopupDismissals -eq 1) 'persisted block does not change budget'
}
$persisted = @{}
$null = Assert-GuardBlocked $unknown 'unknown_dialog' -State $persisted
$persistedError = ''
try {
    $null = Resolve-CaptureInterruptions -Source $upgrade -ExpectedPackage 'test.app' -State $persisted `
        -Refresh { throw 'must not refresh' } -Tap { throw 'must not tap' } -OnBlocked { throw 'must not repeat evidence' }
} catch { $persistedError = $_.Exception.Message }
Assert-Guard ($persistedError -ceq 'CAPTURE_POPUP_MANUAL_REQUIRED' -and $persisted.CapturePopupDismissals -eq 0) 'real blocked call persists into subsequent upgrade call'
foreach ($file in @('gateway-popup-guard.ps1', 'test-popup-guard.ps1')) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $file))
    Assert-Guard ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) 'UTF-8 BOM for Windows PowerShell'
}
Write-Output "PASS: $script:checks offline popup guard checks (PowerShell $($PSVersionTable.PSVersion))"
