param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
    throw "Восстановление заменит текущие данные. Повторите с параметром -ConfirmRestore."
}
$source = (Resolve-Path $BackupFile).Path
if ((Get-Item $source).Length -eq 0) { throw "Файл резервной копии пуст." }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot
$container = (docker compose ps -q db).Trim()
if (-not $container) { throw "PostgreSQL не запущен." }

$remote = "/tmp/sweet-shop-restore.dump"
$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "sweet_shop" }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "sweet_shop" }
docker cp $source "${container}:$remote"
docker exec $container pg_restore -U $dbUser -d $dbName --clean --if-exists --no-owner $remote
if ($LASTEXITCODE -ne 0) { throw "pg_restore завершился с ошибкой." }
docker exec $container rm -f $remote | Out-Null
Write-Host "База восстановлена из: $source"
