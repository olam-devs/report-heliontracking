@echo off
REM VPS — git pull + deploy (run after first install)
setlocal
set REPO=C:\helion\_repo\fleet-incident-reporter

cd /d "%REPO%"
git pull origin main
if errorlevel 1 (
  echo git pull failed
  exit /b 1
)

call deploy\vps-deploy.cmd
endlocal
