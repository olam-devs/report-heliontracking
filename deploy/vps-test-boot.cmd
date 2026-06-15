@echo off
REM Find why node server.js exits with no output
setlocal
set LIVE=C:\helion\fleet-incident-reporter
cd /d "%LIVE%"

echo === Node ===
where node
node -v
echo.

echo === server.js exists? ===
if not exist server.js (
  echo ERROR: %LIVE%\server.js MISSING
  exit /b 1
)
for %%A in (server.js) do echo server.js size: %%~zA bytes
echo First 3 lines:
more +0 server.js | more /E +3
echo.

echo === node_modules? ===
if not exist node_modules\express (
  echo ERROR: node_modules missing — run: npm install
  exit /b 1
)
echo node_modules OK
echo.

echo === .env? ===
if not exist .env (
  echo ERROR: .env missing
  exit /b 1
)
echo .env OK
echo.

echo === Smoke test ===
node deploy\vps-smoke-test.js
if errorlevel 1 exit /b 1
echo.

echo === Starting server (5 sec) ===
start /B node server.js > "%TEMP%\fleet-boot.log" 2>&1
timeout /t 5 /nobreak >nul
type "%TEMP%\fleet-boot.log"
echo.
curl -s http://127.0.0.1:3002/api/health
echo.
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *" 2>nul
endlocal
