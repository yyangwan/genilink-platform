param(
    [Parameter(Mandatory)][ValidateSet("doubao", "yuanbao", "deepseek", "qwen", "kimi")]
    [string]$Platform,
    [Parameter(Mandatory)][string]$DeviceSerial,
    [string]$Prompt = ""
)

$ErrorActionPreference = "Stop"
if (-not $Prompt) {
    $Prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(
        "5q+U6L6D5aW955qE5LiA56uZ5byPR0VP5bmz5Y+w5pyJ5ZOq5Lqb"
    ))
}
$env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL = $DeviceSerial
$id = "isolated-$Platform-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$task = @{
    id = $id
    payload = @{
        prompt = $Prompt
        timeout_seconds = 300
        new_conversation = $true
        device_serial = $DeviceSerial
        appium_system_port = 8299
        appium_mjpeg_server_port = 9299
    }
} | ConvertTo-Json -Depth 10 -Compress
$handler = if ($Platform -eq "doubao") {
    Join-Path $PSScriptRoot "handlers\doubao-app.ps1"
} else {
    Join-Path $PSScriptRoot "handlers\research-app-common.ps1"
}
$started = Get-Date
try {
    $output = if ($Platform -eq "doubao") {
        & $handler -TaskJson $task
    } else {
        & $handler -TaskJson $task -Platform $Platform
    }
    $result = if ($output -is [string]) {
        ($output | Select-Object -Last 1) | ConvertFrom-Json
    } else {
        $output | Select-Object -Last 1
    }
    $resultPath = Join-Path $PSScriptRoot "$id-result.json"
    $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $resultPath -Encoding UTF8
    "task_id=$id"
    "platform=$Platform reference_count=$($result.reference_count) source_count=$($result.source_count) exact=$($result.source_success_count) status=$($result.capture_status)"
    "duration_ms=$($result.duration_ms) source_duration_ms=$($result.source_collection_duration_ms)"
    foreach ($source in @($result.sources)) {
        "source index=$($source.index) resolution=$($source.url_resolution) url=$($source.url) error=$($source.error_message)"
    }
    "result_path=$resultPath"
} catch {
    "task_id=$id"
    "failed_after_s=$([math]::Round(((Get-Date) - $started).TotalSeconds))"
    "error=$($_.Exception.Message)"
    throw
}
