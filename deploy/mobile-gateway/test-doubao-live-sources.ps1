param([Parameter(Mandatory)][string]$DeviceSerial)

$ErrorActionPreference = "Stop"
$env:MOBILE_GATEWAY_SHARE_RECEIVER_SERIAL = $DeviceSerial
$script:deviceSerial = $DeviceSerial
$script:taskWorkingPrefix = "doubao-sources-$([guid]::NewGuid().ToString('N'))"
$script:systemPort = 8299
$script:mjpegServerPort = 9299
$appiumBaseUrl = "http://127.0.0.1:4723"
$packageName = "com.larus.nova"
$elementKey = "element-6066-11e4-a52e-4f735466cecf"
$resultRoot = "C:\ProgramData\MobileGateway\results"
$copyLinkLabel = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String("5aSN5Yi26ZO+5o6l")
)
. (Join-Path $PSScriptRoot "gateway-share-receiver.ps1")

$sourcePath = Join-Path $PSScriptRoot "handlers\doubao-app.ps1"
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $sourcePath, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) { throw "Doubao handler syntax error: $($errors[0])" }
foreach ($function in @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $true))) {
    . ([scriptblock]::Create($function.Extent.Text))
}

$mutex = [Threading.Mutex]::new(
    $false,
    "Global\MobileGateway-Android-Device-$DeviceSerial"
)
if (-not $mutex.WaitOne(0)) { throw "Another task owns the test device" }
try {
    $started = Get-Date
    $source = Get-NativePageSource
    $collection = Get-DoubaoSources -SessionId "adb" -AnswerSource $source
    $records = @($collection.sources)
    $exact = @($records | Where-Object {
        $_.status -eq "collected" -and $_.url_resolution -eq "exact" -and $_.url
    }).Count
    $outputPath = Join-Path $PSScriptRoot "$($script:taskWorkingPrefix)-result.json"
    $collection | ConvertTo-Json -Depth 30 |
        Set-Content -LiteralPath $outputPath -Encoding UTF8
    "reference_count=$($collection.reference_count) source_count=$($records.Count) exact=$exact duration_s=$([math]::Round(((Get-Date)-$started).TotalSeconds))"
    foreach ($record in $records) {
        "source index=$($record.index) status=$($record.status) url=$($record.url) error=$($record.error_message)"
    }
    "result_path=$outputPath"
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
