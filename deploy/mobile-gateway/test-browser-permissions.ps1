$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'gateway-browser-permissions.ps1')
$script:calls=@()
function icacls.exe { $script:calls+=,@($args); $global:LASTEXITCODE=$script:exitCode }
$root=Join-Path ([IO.Path]::GetTempPath()) ('gateway-permissions-'+[guid]::NewGuid().ToString('N'))
try {
    $script:exitCode=0
    Initialize-InteractiveBrowserDirectories -BrowserRoot $root -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
    if($script:calls.Count -ne 2){throw 'Expected exactly two mutable directories'}
    foreach($call in $script:calls){
        if($call[0] -notin @((Join-Path $root 'profile'),(Join-Path $root 'work'))){throw 'Grant escaped mutable browser directories'}
        if($call[2] -notmatch '^\*S-1-.*:\(OI\)\(CI\)M$'){throw 'Expected account-specific inherited Modify grant'}
    }
    $script:exitCode=5
    try {Initialize-InteractiveBrowserDirectories -BrowserRoot $root -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name);throw 'Expected failure'}
    catch {if($_.Exception.Message -notmatch 'Browser directory permissions failed'){throw}}
    Write-Output 'Browser directory permission tests passed'
} finally {
    if([IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()))){Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue}
}
