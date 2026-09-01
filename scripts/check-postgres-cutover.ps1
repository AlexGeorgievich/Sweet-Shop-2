param([PSCredential]$Credential)

$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$legacyCount = @(Get-ChildItem ".\site\.data\orders\SI-*.json" -ErrorAction SilentlyContinue).Count
if (-not $Credential) { $Credential = Get-Credential -Message "Учётная запись CRM для сверки" }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = $Credential.UserName; password = $Credential.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod "http://localhost:8000/api/v1/auth/login" -Method Post -ContentType "application/json" -Body $body -WebSession $session | Out-Null
$response = Invoke-RestMethod "http://localhost:8000/api/v1/crm/orders" -WebSession $session
$postgresCount = @($response.orders).Count
Invoke-RestMethod "http://localhost:8000/api/v1/auth/logout" -Method Post -WebSession $session | Out-Null

Write-Host "JSON orders:       $legacyCount"
Write-Host "PostgreSQL orders: $postgresCount"

if ($legacyCount -ne $postgresCount) {
    throw "Количество заказов не совпадает. Не переключайте backend."
}

Write-Host "Сверка пройдена. Можно одновременно включить ORDER_BACKEND=fastapi и CRM_BACKEND=fastapi."
