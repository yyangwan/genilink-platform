function Initialize-InteractiveBrowserDirectories {
    param(
        [Parameter(Mandatory)][string]$BrowserRoot,
        [Parameter(Mandatory)][string]$UserId
    )
    $sid = ([Security.Principal.NTAccount]::new($UserId)).Translate(
        [Security.Principal.SecurityIdentifier]
    ).Value
    foreach ($name in @('profile', 'work')) {
        $path = Join-Path ([IO.Path]::GetFullPath($BrowserRoot)) $name
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        if ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Browser directory must not be a reparse point: $path"
        }
        # Existing SYSTEM-owned Chrome files also need the interactive user's grant.
        & icacls.exe $path /grant ("*${sid}:(OI)(CI)M") /T /Q | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Browser directory permissions failed: $path" }
    }
}
