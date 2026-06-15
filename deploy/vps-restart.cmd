@echo off
REM Free port 3002 and start helion-fleet-reporter
setlocal EnableDelayedExpansion
set LIVE=C:\helion\fleet-incident-reporter
cd /d "%LIVE%"

echo === What is using port 3002? ===
netstat -ano | findstr ":3002" | findstr LISTENING
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3002" ^| findstr LISTENING') do (
  echo Killing PID %%P ...
  taskkill /F /PID %%P 2>nul
)

pm2 delete helion-fleet-reporter 2>nul
pm2 delete helion-report-portal 2>nul

echo.
echo === Start app ===
pm2 start deploy\ecosystem.config.cjs --update-env
pm2 save

timeout /t 4 /nobreak >nul
echo.
pm2 status
curl -s http://127.0.0.1:3002/api/health
echo.
endlocal
