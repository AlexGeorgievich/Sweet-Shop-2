param(
    [string]$Destination = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop не найден."
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$container = (docker compose ps -q db).Trim()
if (-not $container) { throw "PostgreSQL не запущен. Сначала выполните scripts\start-local.ps1." }

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$target = Join-Path (Resolve-Path $Destination).Path "sweet-shop_$stamp.dump"
$remote = "/tmp/sweet-shop-backup.dump"
$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "sweet_shop" }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "sweet_shop" }

docker exec $container pg_dump -U $dbUser -d $dbName --format=custom --file=$remote
if ($LASTEXITCODE -ne 0) { throw "pg_dump завершился с ошибкой." }
docker cp "${container}:$remote" $target
docker exec $container rm -f $remote | Out-Null

if (-not (Test-Path $target) -or (Get-Item $target).Length -eq 0) {
    throw "Файл резервной копии не создан."
}
Write-Host "Резервная копия создана: $target"
