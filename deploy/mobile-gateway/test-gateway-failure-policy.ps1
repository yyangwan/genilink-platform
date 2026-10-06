$ErrorActionPreference='Stop'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'gateway-agent.ps1'),[ref]$null,[ref]$null)
$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Send-TaskFailure'},$true)
. ([scriptblock]::Create($function.Extent.Text))
function Invoke-GatewayApi {param($Method,$Path,$Body) $script:body=$Body}
function Write-AgentLog {param($Message)}
$task=[pscustomobject]@{id='test'}
Send-TaskFailure $task 'token' 'QWEN_LOGIN_REQUIRED: login expired'
if($script:body.retryable -or $script:body.error_code -ne 'gateway_auth_required'){throw 'Login cannot be retried automatically'}
Send-TaskFailure $task 'token' 'QWEN_CHALLENGE_REQUIRED: human verification'
if($script:body.retryable){throw 'Challenge cannot be retried automatically'}
Send-TaskFailure $task 'token' 'temporary network error'
if(-not $script:body.retryable){throw 'Transient errors should remain retryable'}
Send-TaskFailure $task 'token' 'missing handler' 'handler_not_installed'
if($script:body.retryable){throw 'Missing handler cannot be retried'}
Write-Output 'Gateway failure policy tests passed'
