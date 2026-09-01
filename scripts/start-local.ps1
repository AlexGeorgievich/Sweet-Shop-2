$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop не найден. Установите Docker Desktop и повторите запуск."
}

docker compose up --build -d
docker compose ps

Write-Host ""
Write-Host "Сайт:       http://localhost:3000"
Write-Host "FastAPI:    http://localhost:8000/docs"
Write-Host "API health: http://localhost:8000/health/ready"

