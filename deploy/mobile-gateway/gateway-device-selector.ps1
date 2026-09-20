function Get-AuthorizedDeviceSerials {
    param([string[]]$AdbDeviceLines)

    @(
        foreach ($line in $AdbDeviceLines) {
            if ($line -match '^([^\s]+)\s+device(?:\s|$)') {
                $matches[1]
            }
        }
    )
}

function Select-NextDeviceSerial {
    param(
        [string[]]$ConfiguredSerials,
        [string[]]$OnlineSerials,
        [string]$PreviousSerial
    )

    $configured = @($ConfiguredSerials | Where-Object { $_ } | Select-Object -Unique)
    if ($configured.Count -eq 0) {
        return $null
    }

    $previousIndex = [array]::IndexOf($configured, $PreviousSerial)
    for ($offset = 1; $offset -le $configured.Count; $offset++) {
        $serial = $configured[($previousIndex + $offset) % $configured.Count]
        if ($serial -in $OnlineSerials) {
            return $serial
        }
    }
    return $null
}
