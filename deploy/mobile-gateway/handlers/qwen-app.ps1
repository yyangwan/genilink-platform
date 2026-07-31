param(
    [Parameter(Mandatory)]
    [string]$TaskJson
)

$handlerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $handlerRoot "research-app-common.ps1") `
    -TaskJson $TaskJson `
    -Platform "qwen"
