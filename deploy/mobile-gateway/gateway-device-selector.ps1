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
        [string]$PreviousSerial,
        [string[]]$BusySerials = @()
    )

    $configured = @($ConfiguredSerials | Where-Object { $_ } | Select-Object -Unique)
    if ($configured.Count -eq 0) {
        return $null
    }

    $previousIndex = [array]::IndexOf($configured, $PreviousSerial)
    for ($offset = 1; $offset -le $configured.Count; $offset++) {
        $serial = $configured[($previousIndex + $offset) % $configured.Count]
        if ($serial -in $OnlineSerials -and $serial -notin $BusySerials) {
            return $serial
        }
    }
    return $null
}

function Get-DeviceAppiumPorts {
    param(
        [Parameter(Mandatory)]
        [string[]]$ConfiguredSerials,
        [Parameter(Mandatory)]
        [string]$DeviceSerial
    )

    $configured = @($ConfiguredSerials | Where-Object { $_ } | Select-Object -Unique)
    $index = [array]::IndexOf($configured, $DeviceSerial)
    if ($index -lt 0) {
        throw "Device is not configured: $DeviceSerial"
    }
    @{
        systemPort = 8200 + $index
        mjpegServerPort = 9200 + $index
    }
}

function Get-IdleDeviceSerials {
    param(
        [string[]]$ConfiguredSerials,
        [string[]]$OnlineSerials,
        [string[]]$BusySerials = @()
    )

    @(
        $ConfiguredSerials |
            Where-Object {
                $_ -and
                $_ -in $OnlineSerials -and
                $_ -notin $BusySerials
            } |
            Select-Object -Unique
    )
}

function Get-GatewayConcurrencyLimit {
    param(
        [string[]]$ConfiguredSerials,
        [int]$ConfiguredMaximum = 0
    )

    if ($ConfiguredMaximum -gt 0) {
        return $ConfiguredMaximum
    }
    $deviceCount = @($ConfiguredSerials | Where-Object { $_ } | Select-Object -Unique).Count
    if ($deviceCount -gt 0) {
        return $deviceCount
    }
    1
}

function Get-CaptureExcludedSerials {
    param([object[]]$Failures, [string]$Platform, [string]$TaskId,
        [datetime]$Now = [datetime]::UtcNow)
    @($Failures | Where-Object {
        ($TaskId -and $_.TaskId -eq $TaskId -and ([datetimeoffset]$_.TaskUntil).UtcDateTime -gt $Now) -or
        (([datetimeoffset]$_.Until).UtcDateTime -gt $Now -and ($_.Global -or ($Platform -and $_.Platform -eq $Platform)))
    } | ForEach-Object { $_.Serial } | Select-Object -Unique)
}

function New-CaptureDeviceFailure {
    param([string]$Serial, [string]$Platform, [string]$TaskId,
        [string]$Message, [datetime]$Now = [datetime]::UtcNow)
    $globalFailure = $Message -match 'UI hierarchy dump failed|not authorized|device offline|is locked'
    [pscustomobject]@{
        Serial = $Serial
        Platform = $Platform
        TaskId = $TaskId
        Global = [bool]$globalFailure
        Until = $Now.AddMinutes($(if ($globalFailure) { 20 } else { 10 })).ToString('o')
        TaskUntil = $Now.AddHours(1).ToString('o')
    }
}
