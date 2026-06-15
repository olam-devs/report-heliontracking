@echo off
REM Sync crash-loop fixes to live app and restart PM2 with higher memory limit
setlocal
set REPO=C:\helion\_repo\fleet-incident-reporter
set LIVE=C:\helion\fleet-incident-reporter

echo === Sync server + PM2 config ===
copy /Y "%REPO%\server.js" "%LIVE%\server.js" >nul
copy /Y "%REPO%\deploy\ecosystem.config.cjs" "%LIVE%\deploy\ecosystem.config.cjs" >nul
xcopy /Y "%REPO%\src\tracking\notification-scanner.service.js" "%LIVE%\src\tracking\" >nul

echo === Restart PM2 (7G memory limit, delayed notification scan) ===
cd /d "%LIVE%"
pm2 delete helion-fleet-reporter 2>nul
pm2 start deploy\ecosystem.config.cjs --update-env
pm2 save

timeout /t 5 /nobreak >nul
echo.
echo === Health ===
curl -s http://127.0.0.1:3002/api/health
echo.
pm2 status
endlocal
