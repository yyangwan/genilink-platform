param([ValidateSet('all','kimi','deepseek','doubao')][string]$AdapterCase = 'all')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'gateway-popup-guard.ps1')
. (Join-Path $PSScriptRoot 'gateway-popup-evidence.ps1')
. (Join-Path $PSScriptRoot 'gateway-capture-verifier.ps1')
function Start-Sleep { param($Milliseconds, $Seconds) }
function Write-GatewayTrace { param($Message) }
$script:packageName = 'com.tencent.hunyuan.app.chat'
$packageName = $script:packageName
$script:deviceSerial = 'fixture-device'
$task = [pscustomobject]@{id='fixture-task';payload=[pscustomobject]@{prompt='fixture prompt'}}
$resultRoot = Join-Path ([IO.Path]::GetTempPath()) ('popup-integration-'+[guid]::NewGuid().ToString('N'))
$sourcePaths = @('handlers/research-app-common.ps1','handlers/doubao-app.ps1')
$asts = @()
foreach ($path in $sourcePaths) {
    $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $path), [ref]$null, [ref]$errors)
    if ($errors.Count) { throw "Handler parse failed: $path" }
    $asts += $ast
    foreach ($clause in $ast.FindAll({param($n) $n -is [Management.Automation.Language.CatchClauseAst]},$true)) {
        if ($clause.Body.Statements[0].Extent.Text -notmatch 'CAPTURE_POPUP_') { throw "Capture wrapper can swallow popup failure: $path" }
    }
}
function Load-Function {
    param($Ast, [string]$Name)
    $node=$Ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name},$true)
    if (-not $node) {throw "Missing function $Name"}
    Set-Item -Path "function:script:$Name" -Value ([scriptblock]::Create($node.Body.Extent.Text.TrimStart('{').TrimEnd('}')))
}
$upgrade = '<hierarchy><node class="android.app.Dialog" package="com.tencent.hunyuan.app.chat" bounds="[0,0][500,500]"><node text="&#x53D1;&#x73B0;&#x65B0;&#x7248;&#x672C;" resource-id="com.tencent.hunyuan.app.chat:id/title" package="com.tencent.hunyuan.app.chat"/><node text="&#x53D6;&#x6D88;" class="android.widget.Button" package="com.tencent.hunyuan.app.chat" clickable="true" enabled="true" bounds="[10,400][100,490]"/></node></hierarchy>'
$ready = '<hierarchy><node package="com.tencent.hunyuan.app.chat" text="fixture prompt"/></hierarchy>'
$blocked = '<hierarchy><node class="android.app.Dialog" package="com.tencent.hunyuan.app.chat" bounds="[0,0][500,500]"><node text="unknown alert"/></node></hierarchy>'
$script:taps = 0
function Invoke-CaptureDeviceCommand {
    param($Arguments)
    if ($Arguments -contains 'tap') { $script:taps++ }
    return $true
}
$script:reads=0
function Get-RawPageSource { param($SessionId) $script:reads++; if($script:reads -eq 1){$upgrade}else{$ready} }
function Get-RawNativePageSource { Get-RawPageSource }
try {
    foreach ($i in 0..1) {
        Load-Function $asts[$i] 'Get-PageSource'
        $script:reads=0; $script:capturePopupState=@{}
        if ((Get-PageSource -SessionId adb) -ne $ready -or $script:reads -ne 2) {throw 'Page wrapper did not refresh after closing popup'}
    }
    Load-Function $asts[1] 'Get-NativePageSource'
    $script:reads=0; $script:capturePopupState=@{}
    if ((Get-NativePageSource) -ne $ready) {throw 'Native Doubao wrapper bypassed guard'}
    function Get-RawPageSource { param($SessionId) $script:reads++; $blocked }
    $script:reads=0; $script:capturePopupState=@{CapturedAnswer='retained answer';ReferenceCount=3}
    Remember-CaptureSource -State $script:capturePopupState -Record ([pscustomobject]@{index=1;url='https://source.example/a';url_resolution='exact';status='collected';title='saved source'})
    foreach ($attempt in 1..2) {
        try {Get-NativePageSource | Out-Null;throw 'Expected manual interruption'}
        catch {if($_.Exception.Message -notmatch '^CAPTURE_POPUP_MANUAL_REQUIRED$'){throw}}
    }
    if($script:reads -ne 1){throw 'Blocked task performed more UI reads'}
    $partial=Get-ChildItem -LiteralPath (Join-Path $resultRoot 'fixture-task/interruptions') -Filter '*-partial.json'
    $data=Get-Content -LiteralPath $partial.FullName -Raw | ConvertFrom-Json
    if($data.status -ne 'interrupted' -or $data.answer -ne 'retained answer' -or $data.sources.Count -ne 1 -or $data.reference_count -ne 3){throw 'Partial facts were lost or marked complete'}
    Load-Function $asts[0] 'Wait-ForAnswer'
    $Platform='yuanbao'
    function Get-YuanbaoAnswerSnapshot {param($SessionId) $script:reads++;throw 'CAPTURE_POPUP_MANUAL_REQUIRED'}
    $script:reads=0
    try {Wait-ForAnswer -SessionId adb -Prompt fixture -TimeoutSeconds 20;throw 'Expected popup stop'}
    catch {if($_.Exception.Message -notmatch '^CAPTURE_POPUP_MANUAL_REQUIRED$'){throw}}
    if($script:reads -ne 1){throw 'Answer loop retried a manual popup'}
    $script:collections=0
    try {
        Invoke-SourceCollectionRetry -Collect {
            param($KnownSources)
            $script:collections++
            if($script:collections -gt 1){throw 'CAPTURE_POPUP_MANUAL_REQUIRED'}
            [pscustomobject]@{reference_count=1;sources=@([pscustomobject]@{index=1;title='pending';url=$null})}
        } | Out-Null
        throw 'Expected source-only retry to propagate popup interruption'
    } catch {if($_.Exception.Message -notmatch '^CAPTURE_POPUP_MANUAL_REQUIRED$'){throw}}
    if($script:collections -ne 2){throw 'Source-only wrapper kept retrying after popup'}
    $script:restores=0
    function Return-ToYuanbaoSourcePanel {param($SessionId) $script:restores++}
    function Return-ToKimiConversation {param($SessionId) $script:restores++}
    function Return-ToKimiSearchPanel {param($SessionId) $script:restores++}
    function Return-ToDoubaoChat {param($SessionId) $script:restores++}
    function Restore-NativeReferencePanel { $script:restores++ }
    foreach($name in @('Resolve-YuanbaoSourceUrl','Resolve-KimiSourceUrl','Resolve-KimiInlineSearchFallback','Get-DoubaoSources')) {
        $ast=if($name -eq 'Get-DoubaoSources'){$asts[1]}else{$asts[0]}
        $function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
        foreach($statement in $function.FindAll({param($n) $n -is [Management.Automation.Language.TryStatementAst] -and $null -ne $n.Finally},$true)) {
            $body=$statement.Finally.Extent.Text
            $disabledPackage=$null
            $Record=[pscustomobject]@{status='failed';error_message='CAPTURE_POPUP_MANUAL_REQUIRED'}
            $sourceResult=@{error_message='CAPTURE_POPUP_MANUAL_REQUIRED'}
            & ([scriptblock]::Create($body.Substring(1,$body.Length-2)))
        }
    }
    if($script:restores){throw 'Finally navigated after manual popup'}
    $secret='<hierarchy><node class="android.app.Dialog"><node text="private-token" password="true"/></node></hierarchy>'
    Save-CapturePopupEvidence -Source $secret -Reason protected_dialog -TaskKey sensitive -ResultRoot $resultRoot -DeviceSerial ''
    $evidence=Get-ChildItem (Join-Path $resultRoot 'sensitive/interruptions') -Filter '*.json'
    $json=Get-Content $evidence.FullName -Raw
    if($json -match 'private-token' -or @((Get-Content $evidence.FullName -Raw | ConvertFrom-Json).screenshot)[0]){throw 'Sensitive UI leaked to diagnostics'}
    if ($AdapterCase -in @('all','kimi')) {
        Load-Function $asts[0] 'ConvertTo-Xml'
        Load-Function $asts[0] 'Get-Bounds'
        Load-Function $asts[0] 'Get-PromptInputBounds'
        $packageName='com.moonshot.kimichat'
        $script:inputPage='<hierarchy><node package="com.moonshot.kimichat" class="android.widget.EditText" enabled="true" clickable="true" password="false" bounds="[240,2065][984,2209]"><node text="尽管问，或做个任务..." class="android.widget.TextView" package="com.moonshot.kimichat"/></node></hierarchy>'
        function Get-PageSource { param($SessionId) $script:inputPage }
        $bounds=Get-PromptInputBounds -SessionId adb -TargetPlatform kimi
        if (-not $bounds -or $bounds.center_x -ne 612 -or $bounds.center_y -ne 2137) { throw 'Current Kimi editable input was missed' }
        $script:inputPage=$script:inputPage.Replace('尽管问，或做个任务...','A draft with quotes &amp; Chinese')
        if (-not (Get-PromptInputBounds -SessionId adb -TargetPlatform kimi)) { throw 'Kimi locator depends on placeholder instead of editor' }
        $editor=$script:inputPage.Replace('<hierarchy>','').Replace('</hierarchy>','')
        $script:inputPage='<hierarchy>'+$editor+$editor+'</hierarchy>'
        if (Get-PromptInputBounds -SessionId adb -TargetPlatform kimi) { throw 'Ambiguous Kimi editors must not select the first' }
        foreach ($replacement in @('other.app','com.android.systemui')) {
            $script:inputPage='<hierarchy>'+$editor.Replace('com.moonshot.kimichat',$replacement)+'</hierarchy>'
            if (Get-PromptInputBounds -SessionId adb -TargetPlatform kimi) { throw 'Foreign editor accepted for Kimi' }
        }
        $script:inputPage='<hierarchy>'+$editor.Replace('password="false"','password="true"')+'</hierarchy>'
        if (Get-PromptInputBounds -SessionId adb -TargetPlatform kimi) { throw 'Password editor accepted for Kimi' }
        $script:inputPage='<hierarchy><node class="android.webkit.WebView">'+$editor+'</node></hierarchy>'
        if (Get-PromptInputBounds -SessionId adb -TargetPlatform kimi) { throw 'Web content accepted as native Kimi input' }
    }
    if ($AdapterCase -in @('all','deepseek')) {
        foreach ($name in @('ConvertTo-Xml','Get-Bounds','Set-DeepSeekPromptText')) { Load-Function $asts[0] $name }
        $Platform='deepseek';$packageName='com.deepseek.chat';$script:deviceSerial='fixture-device'
        function Get-PageSource { param($SessionId) $script:inputPage }
        $script:originalIme='test.keyboard/.IME';$script:ime=$script:originalIme
        $script:inputCommands=[Collections.Generic.List[string]]::new();$script:failTyping=$false;$script:hasUnicodeIme=$true
        function Invoke-CaptureNativeCommand {
            param($FilePath,$Arguments,$Operation,$TimeoutSeconds)
            if ($TimeoutSeconds -gt 15 -or $Arguments -notlike '-s fixture-device *') { throw 'Input command is not device scoped and bounded' }
            $script:inputCommands.Add($Arguments)
            if ($Arguments -match 'settings get secure default_input_method$') { return $script:ime }
            if ($Arguments -match 'ime list -a -s$') { if($script:hasUnicodeIme){return "test.keyboard/.IME`nio.appium.settings/.UnicodeIME"}else{return $script:originalIme} }
            if ($Arguments -match 'ime list -s$') { return $script:originalIme }
            if ($Arguments -match 'ime set (.+)$') { $script:ime=$Matches[1].Trim([char]39);return 'selected' }
            if ($Arguments -match 'shell input text') { if($script:failTyping){throw 'CAPTURE_NATIVE_TIMEOUT: injected input timeout'} }
            return ''
        }
        function Invoke-AppiumRequest { throw 'DeepSeek input must not call UiAutomator2 or clipboard' }
        $script:promptText='中文 & quotes '' " ; $(unsafe) + emoji 🌱'+("长文本"*120)
        $script:inputPage='<hierarchy><node class="android.widget.EditText" package="com.deepseek.chat" enabled="true" focused="true" text="'+[Security.SecurityElement]::Escape($script:promptText)+'" bounds="[10,100][900,400]"/></hierarchy>'
        Set-DeepSeekPromptText -Text $script:promptText
        if ($script:ime -ne $script:originalIme) { throw 'Original keyboard not restored after typing' }
        $decoded=''
        foreach ($command in $script:inputCommands) {
            if ($command -match "shell input text '(&[A-Za-z0-9+,]+-)'$") {
                $data=$Matches[1].Substring(1,$Matches[1].Length-2).Replace(',','/')
                $data=$data.PadRight($data.Length+((4-$data.Length%4)%4),'=')
                $decoded += [Text.Encoding]::BigEndianUnicode.GetString([Convert]::FromBase64String($data))
            } elseif ($command -match 'shell input text') { throw 'Raw prompt escaped into a shell command' }
        }
        if ($decoded -cne $script:promptText) { throw 'Unicode prompt chunks did not round trip exactly' }
        if (-not ($script:inputCommands -match 'ime disable io.appium.settings/.UnicodeIME$')) { throw 'Temporary keyboard enable not restored' }
        $script:failTyping=$true
        try { Set-DeepSeekPromptText -Text 'test';throw 'Expected controlled input failure' }
        catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_TIMEOUT'){throw} }
        if ($script:ime -ne $script:originalIme) { throw 'Original keyboard not restored after timeout' }
        $script:failTyping=$false;$script:inputPage='<hierarchy><node package="com.deepseek.chat" class="android.widget.EditText" text="wrong draft" bounds="[10,100][900,400]"/></hierarchy>'
        try { Set-DeepSeekPromptText -Text 'test';throw 'Expected unverified draft failure' }
        catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_OUTPUT_TIMEOUT'){throw} }
        $script:inputPage='<hierarchy><node package="com.deepseek.chat" class="android.widget.EditText" enabled="true" focused="false" text="test" bounds="[10,100][900,400]"/></hierarchy>'
        try { Set-DeepSeekPromptText -Text 'test';throw 'Expected unfocused draft failure' }
        catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_OUTPUT_TIMEOUT'){throw} }
        $script:hasUnicodeIme=$false;$script:inputCommands.Clear()
        try { Set-DeepSeekPromptText -Text 'test';throw 'Expected missing installed keyboard failure' }
        catch { if($_.Exception.Message -notmatch 'CAPTURE_NATIVE_OUTPUT_TIMEOUT'){throw} }
        if($script:inputCommands -match 'ime (set|enable) '){throw 'Changed input state when required keyboard was missing'}
    }
    if ($AdapterCase -in @('all','doubao')) {
        foreach ($name in @('Get-DoubaoSources','Complete-DoubaoSourceRecords','Test-DoubaoRetryableSourceError','ConvertTo-CanonicalSourceUrl','Get-NativePageSource')) { Load-Function $asts[1] $name }
        $packageName='com.larus.nova';$script:deviceSerial='fixture-device'
        $script:referencePage='<hierarchy><node package="com.larus.nova" resource-id="com.larus.nova:id/ll_source_item"><node text="1."/></node></hierarchy>'
        $script:pdfPage='<hierarchy><node class="android.app.Dialog" package="com.huawei.browser" bounds="[0,1200][1080,2300]"><node text="下载" class="android.widget.TextView" package="com.huawei.browser"/><node text="文件名：" package="com.huawei.browser"/><node text="example.pdf" package="com.huawei.browser"/><node text="大小：" package="com.huawei.browser"/><node text="取消" class="android.widget.Button" package="com.huawei.browser" clickable="true" enabled="true" bounds="[100,2100][400,2200]"/><node text="下载" class="android.widget.Button" package="com.huawei.browser" clickable="true" enabled="true" bounds="[600,2100][900,2200]"/></node></hierarchy>'
        $script:unknownPage='<hierarchy><node class="android.app.Dialog" package="com.huawei.browser" bounds="[0,1200][1080,2300]"><node text="Unknown dialog" package="com.huawei.browser"/></node></hierarchy>'
        function Get-ReferenceSummary { param($Source) @{reference_count=3;search_keyword_count=1} }
        function Restore-NativeReferencePanel {}
        function Get-DoubaoTaskId { 'fixture-native-task' }
        function Get-DoubaoSourceCatalog { param($ReferenceCount) foreach($i in 1..3){[pscustomobject]@{index=$i;title="source-$i"}} }
        function Find-DoubaoSourceNode { param($Index,$Title) @{title="source-$Index";node=[pscustomobject]@{index=$Index}} }
        function Get-DirectClipboardText { $null }
        function adb { $global:LASTEXITCODE=0 }
        function Invoke-NativeNodeTap { param($Node) $script:sourceIndex=[int]$Node.index;$script:sourceOpens++ }
        function Get-ForegroundPackage { 'com.huawei.browser' }
        function Get-ForegroundIntentUrl { param($PreviousRecentState,$ForegroundPackage) if($script:sourceIndex -eq 3){'https://example.test/third'}elseif($script:pdfHasUrl){'https://example.test/whitepaper.pdf'} }
        function Get-RawNativePageSource {
            if($script:sourceIndex -eq 1 -and -not $script:cancelled){if($script:unknownDownload){$script:unknownPage}else{$script:pdfPage}}else{$script:referencePage}
        }
        function Invoke-CaptureDeviceCommand {
            param($Arguments)
            if($Arguments -contains 'tap'){
                if($Arguments[-2] -ne '250' -or $Arguments[-1] -ne '2150'){throw 'Not the PDF cancel control'}
                $script:cancelled=$true
            }
            return $true
        }
        function Return-ToDoubaoChat {param($SessionId) $script:sourceIndex=0;$script:sourceReturns++}
        $known=[pscustomobject]@{index=2;title='source-2';url='https://example.test/known';raw_url='https://example.test/known';url_resolution='exact';status='collected'}
        foreach($script:pdfHasUrl in @($false,$true)) {
            $script:sourceIndex=0;$script:cancelled=$false;$script:sourceOpens=0;$script:sourceReturns=0;$script:unknownDownload=$false;$script:capturePopupState=@{}
            $result=Get-DoubaoSources -SessionId adb -AnswerSource $script:referencePage -KnownSources @($known)
            if($result.sources.Count -ne 3 -or $result.sources[2].url -ne 'https://example.test/third' -or $script:sourceOpens -ne 2){throw 'PDF source prevented later source capture'}
            if(-not $script:cancelled -or $script:capturePopupState.SourceDownloadContext){throw 'Download was not cancelled or source context leaked'}
            if($script:pdfHasUrl){if($result.sources[0].url -ne 'https://example.test/whitepaper.pdf'){throw 'Observed PDF URL lost'}}
            elseif($result.sources[0].url -or $result.sources[0].url_resolution -ne 'unavailable'){throw 'Unobserved PDF URL was invented'}
            if(-not $script:pdfHasUrl){
                $again=Get-DoubaoSources -SessionId adb -AnswerSource $script:referencePage -KnownSources @($known,$result.sources[2])
                if($script:sourceOpens -ne 2 -or $again.sources.Count -ne 3){throw 'Source-only retry reopened a cancelled PDF'}
            }
        }
        $script:sourceIndex=0;$script:cancelled=$false;$script:sourceOpens=0;$script:sourceReturns=0;$script:unknownDownload=$true;$script:capturePopupState=@{}
        try { Get-DoubaoSources -SessionId adb -AnswerSource $script:referencePage -KnownSources @($known)|Out-Null;throw 'Unknown source dialog should stop' }
        catch {if($_.Exception.Message -notmatch '^CAPTURE_POPUP_MANUAL_REQUIRED$'){throw}}
        if($script:sourceOpens -ne 1 -or $script:sourceReturns -ne 0){throw 'Navigated after unknown source popup'}
        if($script:capturePopupState.ReferenceCount -ne 3 -or $script:capturePopupState.CapturedSources.Count -ne 3 -or $script:capturePopupState.CapturedSources['2'].url -ne $known.url){throw 'Interrupted source catalog or known URL was lost'}
    }
    Write-Output 'Popup adapter integration, input verification, PDF source continuation, partial retention, and stop propagation tests passed'
} finally {
    if(Test-Path -LiteralPath $resultRoot){
        $full=[IO.Path]::GetFullPath($resultRoot)
        $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
        if(-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid test cleanup path'}
        Remove-Item -LiteralPath $full -Recurse -Force
    }
}
