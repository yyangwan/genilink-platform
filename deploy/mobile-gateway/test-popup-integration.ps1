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
    Write-Output 'Popup adapter integration, partial retention, and stop propagation tests passed'
} finally {
    if(Test-Path -LiteralPath $resultRoot){
        $full=[IO.Path]::GetFullPath($resultRoot)
        $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
        if(-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid test cleanup path'}
        Remove-Item -LiteralPath $full -Recurse -Force
    }
}
