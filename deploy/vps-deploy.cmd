@echo off
REM =============================================================================
REM Helion VPS — deploy fleet-incident-reporter to report.heliontracking.com
REM Run as Administrator on the VPS after git pull in C:\helion\_repo\fleet-incident-reporter
REM
REM SAFE: Does NOT overwrite C:\helion\fleet-incident-reporter\data\ or .env
REM =============================================================================
setlocal EnableDelayedExpansion

set REPO=C:\helion\_repo\fleet-incident-reporter
set APP=C:\helion\fleet-incident-reporter
set STAMP=%date:~-4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set STAMP=%STAMP: =0%
set BACKUP=C:\helion\_backup\fleet-data-%STAMP%

if not exist "%REPO%\server.js" (
  echo ERROR: Repo not found at %REPO%
  echo Clone or copy the project to %REPO% first.
  exit /b 1
)

echo === 1. Backup live data (if any) ===
if exist "%APP%\data" (
  mkdir "%BACKUP%" 2>nul
  xcopy /E /I /Y "%APP%\data" "%BACKUP%\data\" >nul
  echo Backed up to %BACKUP%
)
if exist "%APP%\.env" (
  mkdir "%BACKUP%" 2>nul
  copy /Y "%APP%\.env" "%BACKUP%\.env" >nul
)

echo === 2. Sync code (exclude data, node_modules, .env, uploads) ===
if not exist "%APP%" mkdir "%APP%"
robocopy "%REPO%" "%APP%" /E /XD node_modules client\node_modules .git data uploads .vite deploy\out /XF .env /NFL /NDL /NJH /NJS /NC /NS
if %ERRORLEVEL% GEQ 8 (
  echo ERROR: robocopy failed with code %ERRORLEVEL%
  exit /b 1
)

if not exist "%APP%\data" mkdir "%APP%\data"
if not exist "%APP%\data\tracking" mkdir "%APP%\data\tracking"
if not exist "%APP%\uploads" mkdir "%APP%\uploads"

if not exist "%APP%\.env" (
  echo WARNING: No .env found — copy deploy\.env.vps.example to %APP%\.env and edit secrets.
  copy /Y "%APP%\deploy\.env.vps.example" "%APP%\.env"
)

echo === 3. npm install + build frontend ===
cd /d "%APP%"
call npm install
if errorlevel 1 exit /b 1
cd /d "%APP%\client"
call npm install
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1

echo === 4. Database migrations ===
cd /d "%APP%"
node db\run-migrations.js
node db\apply-v6.js

echo === 5. PM2 — stop old report-portal, start new app ===
pm2 delete helion-report-portal 2>nul
pm2 delete helion-fleet-reporter 2>nul
pm2 start deploy\ecosystem.config.cjs
pm2 save

echo === 6. Health check ===
timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:3002/api/health
echo.

echo.
echo === Deploy complete ===
echo App:    %APP%
echo URL:    https://report.heliontracking.com
echo Data:   %APP%\data  (unchanged if it existed before)
echo.
echo If this is first deploy, run: deploy\vps-import-data.ps1
echo to import your local notifications pack.
endlocal
