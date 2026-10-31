$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'handlers\research-app-common.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
$names = @('ConvertTo-Xml','Get-Bounds','ConvertTo-ModifiedUtf7','ConvertTo-AdbTextArgument','Get-PromptInputBounds','Get-SendButtonBounds','Get-PromptEchoCount','Confirm-PromptDelivery','Clear-NativePromptDraft','Open-KimiSearchPanel')
foreach ($name in $names) {
    $f = $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]}, $true) | Where-Object Name -EQ $name | Select-Object -First 1
    if (-not $f) { throw "Missing delivery safety function: $name" }
    . ([scriptblock]::Create($f.Extent.Text))
}
function Assert($value, $message) { if (-not $value) { throw $message } }
function Start-Sleep { param($Seconds,$Milliseconds) }
function Get-PageSource { param($SessionId) $script:page }
function Decode-ModifiedUtf7($text) {
    [regex]::Replace($text, '&([A-Za-z0-9+,]*)-', {
        param($m)
        if (-not $m.Groups[1].Value) { return '&' }
        $b=$m.Groups[1].Value.Replace(',','/');$b=$b.PadRight($b.Length+((4-$b.Length%4)%4),'=')
        $s=[Text.Encoding]::BigEndianUnicode.GetString([Convert]::FromBase64String($b))
        Assert (-not ($s -match '[\x20-\x7e]')) 'Printable ASCII encoded inside modified UTF-7 shift'
        $s
    })
}
$unicode = -join @([char]0x91c7,[char]0x96c6,[char]0x8f93,[char]0x5165)
$prompt = $unicode + ' 20261031 & quotes '' " ; $(touch nope) %s ' + [char]::ConvertFromUtf32(0x1f331)
$encoded = ConvertTo-ModifiedUtf7 -Text $prompt
Assert ((Decode-ModifiedUtf7 $encoded) -ceq $prompt) 'Canonical modified UTF-7 round trip failed'
Assert ($encoded.Contains('20261031')) 'ASCII must remain outside shifted segments'
Assert ((ConvertTo-ModifiedUtf7 -Text '&') -ceq '&-') 'Ampersand escape missing'
$arg = ConvertTo-AdbTextArgument -Text $encoded
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName='node';$info.Arguments='-e "process.stdout.write(JSON.stringify(process.argv.slice(1)))" '+$arg
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true
$p=[Diagnostics.Process]::Start($info)
try {$output=$p.StandardOutput.ReadToEnd();$p.WaitForExit();$argsOut=@($output|ConvertFrom-Json);Assert ($argsOut.Count -eq 1) 'Windows split the shell argument';Assert ($argsOut[0] -ceq ("'"+$encoded.Replace("'","'\''")+"'")) 'POSIX quoting changed text'} finally {$p.Dispose()}
$packageName='com.tencent.hunyuan.app.chat'
$script:draft="first line`nmiddle line`nlast line";$script:caret=14
function Get-PageSource {
    param($SessionId)
    if($script:simulateClear){return '<hierarchy><node package="com.tencent.hunyuan.app.chat" class="android.widget.EditText" enabled="true" focused="true" text="'+[Security.SecurityElement]::Escape($script:draft)+'"/></hierarchy>'}
    $script:page
}
function Invoke-CaptureNativeCommand {
    param($FilePath,$Arguments,$Operation,$TimeoutSeconds)
    Assert ($TimeoutSeconds -le 10) 'Unbounded draft clearing'
    $keys=($Arguments -split 'keyevent ')[1] -split ' '
    foreach($key in $keys){
        if($key -eq '67' -and $script:caret -gt 0){$script:draft=$script:draft.Remove($script:caret-1,1);$script:caret--}
        elseif($key -eq '112' -and $script:caret -lt $script:draft.Length){$script:draft=$script:draft.Remove($script:caret,1)}
    }
}
$script:simulateClear=$true
Clear-NativePromptDraft -SessionId adb
Assert ($script:draft.Length -eq 0) 'Multiline suffix survived draft clearing'
$script:simulateClear=$false
$editor='<node class="android.widget.EditText" package="com.tencent.hunyuan.app.chat" enabled="true" text="draft" bounds="[60,1500][800,2200]"/>'
$send='<node class="android.widget.Button" package="com.tencent.hunyuan.app.chat" clickable="true" enabled="true" bounds="[930,2040][1070,2180]"/>'
$script:page='<hierarchy><node package="com.tencent.hunyuan.app.chat" bounds="[30,1480][1100,2220]">'+$editor+$send+'</node></hierarchy>'
$b=Get-SendButtonBounds -SessionId adb -TargetPlatform yuanbao
Assert ($b.center_y -eq 2110) 'Send must follow the actual multiline composer, not screen percentage'
$label=-join @([char]0x53d1,[char]0x9001,[char]0x6d88,[char]0x606f)
$nativeSend=$send.Replace('android.widget.Button','android.widget.FrameLayout').Replace('clickable="true"','content-desc="'+$label+'" clickable="true"')
$script:page=$script:page.Replace($send,$nativeSend)
Assert ((Get-SendButtonBounds -SessionId adb -TargetPlatform yuanbao).center_y -eq 2110) 'Named FrameLayout sender was ignored'
$script:page=$script:page.Replace($nativeSend,$send)
$script:page=$script:page.Replace($send,$send+$send)
Assert (-not (Get-SendButtonBounds -SessionId adb -TargetPlatform yuanbao)) 'Ambiguous send controls accepted'
$script:page='<hierarchy><node class="android.webkit.WebView">'+$editor+$send+'</node></hierarchy>'
Assert (-not (Get-SendButtonBounds -SessionId adb -TargetPlatform yuanbao)) 'Web content accepted as native sender'
$packageName='com.deepseek.chat'
$hint=-join @([char]0x53d1,[char]0x6d88,[char]0x606f,[char]0x6216,[char]0x6309,[char]0x4f4f,[char]0x8bf4,[char]0x8bdd)
$script:page='<hierarchy><node class="androidx.compose.ui.viewinterop.ViewFactoryHolder" package="com.deepseek.chat"><node class="android.widget.TextView" package="com.deepseek.chat" text="'+$hint+'" enabled="true" bounds="[80,1800][1000,1860]"/></node></hierarchy>'
Assert ((Get-PromptInputBounds -SessionId adb -TargetPlatform deepseek).center_y -eq 1830) 'Compose placeholder not found'
$packageName='com.tencent.hunyuan.app.chat'
$script:page='<hierarchy><node package="com.tencent.hunyuan.app.chat" class="android.widget.EditText" text="draft"/></hierarchy>'
try { Confirm-PromptDelivery -SessionId adb -Prompt draft -BeforeSource $script:page -Attempts 2; throw 'Unsent draft accepted' } catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_OUTPUT_TIMEOUT'){throw} }
$before='<hierarchy><node package="com.tencent.hunyuan.app.chat" class="android.widget.TextView" text="draft"/></hierarchy>'
$script:page=$before
try { Confirm-PromptDelivery -SessionId adb -Prompt draft -BeforeSource $before -Attempts 2; throw 'Old echo accepted as new send' } catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_OUTPUT_TIMEOUT'){throw} }
$script:page=$before.Replace('</hierarchy>','<node package="com.tencent.hunyuan.app.chat" class="android.widget.TextView" text="draft"/></hierarchy>')
Confirm-PromptDelivery -SessionId adb -Prompt draft -BeforeSource $before -Attempts 2
$script:page='<hierarchy><node package="com.moonshot.kimichat" class="android.view.View" clickable="true" bounds="[20,300][1000,450]"><node package="com.moonshot.kimichat" class="android.widget.TextView" text="'+(-join @([char]0x4f7f,[char]0x7528))+' 1 '+(-join @([char]0x4e2a,[char]0x5de5,[char]0x5177))+', query"/></node></hierarchy>'
function Move-ToKimiConversationTop { param($SessionId) $script:page }
function Test-KimiSearchPanel { param($Source) $true }
$script:taps=0
function adb { $script:taps++;$global:LASTEXITCODE=0 }
Open-KimiSearchPanel -SessionId adb | Out-Null
Assert ($script:taps -eq 1) 'New Kimi tool summary was not opened'
Write-Output 'Prompt encoding, native send geometry, delivery acknowledgement and Kimi summary tests passed.'
