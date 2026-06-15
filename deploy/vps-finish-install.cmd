@echo off
REM =============================================================================
REM VPS — run ALL remaining steps (after fleet-code.zip + fleet-data-pack.zip copied)
REM Run as Administrator in CMD on the VPS
REM =============================================================================
setlocal

set IMPORT=C:\helion\_import
set REPO=C:\helion\_repo\fleet-incident-reporter

echo.
echo === Step 2: Clone from GitHub ===
if not exist "%REPO%\server.js" (
  if exist "%REPO%" rmdir /S /Q "%REPO%" 2>nul
  mkdir C:\helion\_repo 2>nul
  git clone https://github.com/olam-devs/report-heliontracking.git "%REPO%"
  if errorlevel 1 (
    echo ERROR: git clone failed
    exit /b 1
  )
) else (
  cd /d "%REPO%"
  git pull origin main
)
if not exist "%REPO%\server.js" (
  echo ERROR: repo missing server.js
  exit /b 1
)
echo OK: code at %REPO%

echo.
echo === Step 3: Deploy app (build + PM2) ===
call "%REPO%\deploy\vps-deploy.cmd"
if errorlevel 1 exit /b 1

echo.
echo === Step 4: Import local notifications pack (keeps VPS daily-log) ===
if not exist "%IMPORT%\fleet-data-pack.zip" (
  echo WARNING: fleet-data-pack.zip not found — skipping data import
  goto env
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\deploy\vps-import-data.ps1" -SkipDailyLog
if errorlevel 1 exit /b 1

:env
echo.
echo === Step 5: Create .env from helion middleware CMS creds ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\deploy\vps-setup-env.ps1"

echo.
echo === Step 6: MySQL migrations ===
cd /d C:\helion\fleet-incident-reporter
node db\run-migrations.js
node db\apply-v6.js

echo.
echo === Step 7: Restart PM2 with .env ===
pm2 restart helion-fleet-reporter
pm2 save

echo.
echo === Step 8: Nginx for report.heliontracking.com ===
call "%REPO%\deploy\vps-nginx-reload.cmd"

echo.
echo === Health check ===
timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:3002/api/health
echo.
echo.
echo Done. Open: https://report.heliontracking.com
echo Login with your fleet-incident-reporter users (MySQL fleet_incidents).
endlocal
