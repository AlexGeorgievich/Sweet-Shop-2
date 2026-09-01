param([PSCredential]$Credential)

$ErrorActionPreference = "Stop"
if (-not $Credential) { $Credential = Get-Credential -Message "Учётная запись администратора CRM" }
$email = $Credential.UserName
$password = $Credential.GetNetworkCredential().Password
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$live = Invoke-RestMethod "http://localhost:8000/health/live"
$ready = Invoke-RestMethod "http://localhost:8000/health/ready"
if ($live.status -ne "ok" -or $ready.database -ne "ready") { throw "FastAPI не готов." }

$site = Invoke-WebRequest "http://localhost:3000" -UseBasicParsing
if ($site.StatusCode -ne 200) { throw "Витрина не отвечает." }
if ($site.Headers["X-Content-Type-Options"] -ne "nosniff") { throw "Security headers отсутствуют." }
if ($site.Headers["X-Powered-By"]) { throw "Служебный заголовок X-Powered-By не отключён." }

$body = @{ email = $email; password = $password } | ConvertTo-Json
Invoke-RestMethod "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body $body -WebSession $session | Out-Null
$orders = Invoke-RestMethod "http://localhost:3000/api/crm/orders" -WebSession $session
if ($null -eq $orders.orders) { throw "CRM не вернула список заявок." }
Invoke-RestMethod "http://localhost:3000/api/auth/logout" -Method Post -WebSession $session | Out-Null

Write-Host "Smoke-тест пройден: health, витрина, headers, вход, CRM и выход работают."
