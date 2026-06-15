@echo off
REM Sync crash-loop fixes to live app and restart PM2 with higher memory limit
setlocal EnableDelayedExpansion
set REPO=C:\helion\_repo\fleet-incident-reporter
set LIVE=C:\helion\fleet-incident-reporter

if not exist "%LIVE%\server.js" (
  echo ERROR: Live app not found at %LIVE%
  echo Run deploy\vps-deploy.cmd first.
  exit /b 1
)

echo === Sync server + PM2 config ===
copy /Y "%REPO%\server.js" "%LIVE%\server.js" >nul
copy /Y "%REPO%\deploy\ecosystem.config.cjs" "%LIVE%\deploy\ecosystem.config.cjs" >nul
xcopy /Y "%REPO%\src\tracking\notification-scanner.service.js" "%LIVE%\src\tracking\" >nul

if not exist "%LIVE%\.env" (
  echo ERROR: Missing %LIVE%\.env — copy deploy\.env.vps.example and set DB_PASS, JWT_SECRET, CMS password.
  exit /b 1
)

echo === Quick syntax check ===
cd /d "%LIVE%"
node --check server.js
if errorlevel 1 (
  echo ERROR: server.js has a syntax error
  exit /b 1
)

echo === Restart PM2 (7G memory limit, delayed notification scan) ===
pm2 delete helion-fleet-reporter 2>nul
pm2 start "%LIVE%\deploy\ecosystem.config.cjs" --update-env
if errorlevel 1 (
  echo ERROR: pm2 start failed — try manually:
  echo   cd /d %LIVE%
  echo   node server.js
  exit /b 1
)
pm2 save

timeout /t 8 /nobreak >nul
echo.
echo === PM2 status ===
pm2 status
echo.
echo === Last 30 log lines ===
pm2 logs helion-fleet-reporter --lines 30 --nostream 2>nul
echo.
echo === Health ===
curl -s http://127.0.0.1:3002/api/health
echo.
endlocal
