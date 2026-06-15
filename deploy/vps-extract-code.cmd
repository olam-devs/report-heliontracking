@echo off
REM Extract fleet-code.zip into C:\helion\_repo\fleet-incident-reporter
setlocal
set ZIP=C:\helion\_import\fleet-code.zip
set REPO=C:\helion\_repo\fleet-incident-reporter
set STAGE=C:\helion\_import\_fleet-code-stage

if not exist "%ZIP%" (
  echo ERROR: Copy fleet-code.zip to %ZIP%
  exit /b 1
)

if exist "%STAGE%" rmdir /S /Q "%STAGE%"
mkdir "%STAGE%"
mkdir "%REPO%" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%STAGE%' -Force"

if not exist "%STAGE%\server.js" (
  echo ERROR: Invalid zip — server.js not found after extract
  exit /b 1
)

echo Syncing to %REPO% ...
robocopy "%STAGE%" "%REPO%" /E /NFL /NDL /NJH /NJS /NC /NS
rmdir /S /Q "%STAGE%"

echo OK: %REPO%
dir "%REPO%\server.js"
endlocal
