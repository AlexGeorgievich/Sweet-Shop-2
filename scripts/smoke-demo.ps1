param([PSCredential]$Credential)

$ErrorActionPreference = "Stop"
if (-not $Credential) { $Credential = Get-Credential -Message "CRM admin credentials" }
$email = $Credential.UserName
$password = $Credential.GetNetworkCredential().Password
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loggedIn = $false

function Invoke-CrmJson {
    param([string]$Path, [string]$Method = "Get", [object]$Body = $null)
    $parameters = @{
        Uri = "http://localhost:3000/api/backend/$Path"
        Method = $Method
        WebSession = $session
    }
    if ($null -ne $Body) {
        $parameters.ContentType = "application/json"
        $parameters.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    Invoke-RestMethod @parameters
}

try {
    $loginBody = @{ email = $email; password = $password } | ConvertTo-Json
    Invoke-RestMethod "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session | Out-Null
    $loggedIn = $true

    Invoke-CrmJson -Path "admin/data-mode" -Method Post -Body @{ dataMode = "production" } | Out-Null
    $production = Invoke-RestMethod "http://localhost:3000/api/crm/orders" -WebSession $session
    $productionCount = @($production.orders).Count

    Invoke-CrmJson -Path "admin/data-mode" -Method Post -Body @{ dataMode = "demo" } | Out-Null
    $generated = Invoke-CrmJson -Path "admin/demo/generate" -Method Post -Body @{
        count = 1000
        seed = 20260831
        asOf = "2026-08-31"
    }
    if ($generated.count -ne 1000 -or $generated.summary.orders -ne 1000) {
        throw "Generator did not confirm 1000 demo orders."
    }

    $demo = Invoke-RestMethod "http://localhost:3000/api/crm/orders" -WebSession $session
    if (@($demo.orders).Count -ne 1000) { throw "Expected 1000 demo orders." }
    $insights = Invoke-CrmJson -Path "crm/insights"
    if ($insights.summary.orders -ne 1000) { throw "Insights mixes data modes." }
    $productionCalendar = Invoke-CrmJson -Path "crm/production"
    if (@($productionCalendar.orders).Count -eq 0) { throw "Demo production calendar is empty." }

    Invoke-CrmJson -Path "admin/data-mode" -Method Post -Body @{ dataMode = "production" } | Out-Null
    $restored = Invoke-RestMethod "http://localhost:3000/api/crm/orders" -WebSession $session
    if (@($restored.orders).Count -ne $productionCount) { throw "Production changed after demo generation." }

    Write-Host "Demo smoke passed: 1000 orders, CRM isolation and production restore confirmed."
}
finally {
    if ($loggedIn) {
        try { Invoke-CrmJson -Path "admin/data-mode" -Method Post -Body @{ dataMode = "production" } | Out-Null } catch { }
        try { Invoke-RestMethod "http://localhost:3000/api/auth/logout" -Method Post -WebSession $session | Out-Null } catch { }
    }
}
