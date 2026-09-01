@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "SITE_DIR=%PROJECT_ROOT%site"

if not exist "%SITE_DIR%\package.json" (
  echo [error] Не найден %SITE_DIR%\package.json
  exit /b 1
)

pushd "%SITE_DIR%"

node scripts\local-runtime.mjs 3000
if errorlevel 1 (
  echo [error] Не удалось безопасно освободить порт 3000.
  popd
  exit /b 1
)

call npm run build
if errorlevel 1 (
  echo [error] Production-сборка завершилась с ошибкой.
  popd
  exit /b 1
)

powershell.exe -NoProfile -Command "Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','start' -WorkingDirectory '%SITE_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%SITE_DIR%\server.out.log' -RedirectStandardError '%SITE_DIR%\server.err.log'"

powershell.exe -NoProfile -Command "$ok=$false; 1..30 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:3000; if ($r.StatusCode -eq 200) { $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if (-not $ok) { exit 1 }"
if errorlevel 1 (
  echo [error] Сервер не ответил на http://127.0.0.1:3000. Проверьте site\server.err.log
  popd
  exit /b 1
)

call npm run check:server
if errorlevel 1 (
  echo [error] Сервер запущен, но клиентские файлы не соответствуют свежей сборке.
  popd
  exit /b 1
)

powershell.exe -NoProfile -Command "$running=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'telegram-polling\.mjs' }; if (-not $running) { Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','bot' -WorkingDirectory '%SITE_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%SITE_DIR%\bot.out.log' -RedirectStandardError '%SITE_DIR%\bot.err.log' }"

start "" http://localhost:3000
echo Сайт: http://localhost:3000
echo CRM: http://localhost:3000/crm
echo Аналитика: http://localhost:3000/crm/analytics
echo Telegram-бот запущен в фоне. Журнал: site\bot.out.log
popd
endlocal
