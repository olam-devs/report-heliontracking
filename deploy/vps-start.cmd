@echo off
REM Start fleet reporter in PM2 (run from repo or anywhere)
setlocal
set LIVE=C:\helion\fleet-incident-reporter
cd /d "%LIVE%"
if not exist server.js (
  echo ERROR: %LIVE%\server.js not found
  exit /b 1
)
pm2 delete helion-fleet-reporter 2>nul
pm2 start deploy\ecosystem.config.cjs --update-env
pm2 save
timeout /t 3 /nobreak >nul
pm2 status
curl -s http://127.0.0.1:3002/api/health
echo.
endlocal
