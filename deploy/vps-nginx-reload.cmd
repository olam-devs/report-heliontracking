@echo off
REM Install nginx server block for report.heliontracking.com and reload
setlocal
set NGINX=C:\nginx\nginx-1.30.0
set CONF=%NGINX%\conf\nginx.conf
set BLOCK=%~dp0nginx-report.heliontracking.com.conf
set SNIP=%NGINX%\conf\helion-report-fleet.conf

if not exist "%NGINX%\nginx.exe" (
  echo WARNING: nginx not found at %NGINX%
  echo Manually include: %BLOCK%
  exit /b 0
)

copy /Y "%BLOCK%" "%SNIP%" >nul
findstr /C:"helion-report-fleet.conf" "%CONF%" >nul 2>&1
if errorlevel 1 (
  echo.>> "%CONF%"
  echo include helion-report-fleet.conf;>> "%CONF%"
  echo Added include to nginx.conf
)

cd /d "%NGINX%"
nginx -t
if errorlevel 1 (
  echo ERROR: nginx -t failed — fix config manually
  exit /b 1
)
nginx -s reload
echo nginx reloaded for report.heliontracking.com
endlocal
