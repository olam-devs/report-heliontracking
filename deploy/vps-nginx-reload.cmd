@echo off
REM Install nginx server block for report.heliontracking.com and reload
setlocal
set NGINX_HOME=C:\nginx\nginx-1.30.0
set CONF=%NGINX_HOME%\conf\nginx.conf
set BLOCK=%~dp0nginx-report.heliontracking.com.conf
set SNIP=%NGINX_HOME%\conf\helion-report-fleet.conf
set PATCH=%~dp0vps-nginx-patch.ps1

if not exist "%NGINX_HOME%\nginx.exe" (
  echo WARNING: nginx not found at %NGINX_HOME%
  echo Manually include: %BLOCK%
  exit /b 0
)

copy /Y "%BLOCK%" "%SNIP%" >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%PATCH%" -ConfPath "%CONF%"
if errorlevel 1 (
  echo ERROR: failed to update nginx.conf
  exit /b 1
)

cd /d "%NGINX_HOME%"
REM nginx.exe reads NGINX env var as a socket — clear our install-path variable name clash
set NGINX=
echo === nginx -t ===
nginx -t 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: nginx -t failed. Open %CONF% and ensure:
  echo   include helion-report-fleet.conf;  is INSIDE the http { } block
  echo   Remove duplicate report.heliontracking.com server blocks
  exit /b 1
)
nginx -s reload
echo nginx reloaded for report.heliontracking.com
endlocal
