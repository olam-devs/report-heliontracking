@echo off
REM Quick VPS health check for fleet-incident-reporter
setlocal
echo === PM2 ===
pm2 status
echo.
echo === Last 40 log lines ===
pm2 logs helion-fleet-reporter --lines 40 --nostream 2>nul
echo.
echo === Local API health ===
curl -s http://127.0.0.1:3002/api/health
echo.
echo.
echo === HTTPS health ===
curl -s https://report.heliontracking.com/api/health
echo.
echo.
echo === Port 3002 ===
netstat -ano | findstr ":3002"
echo.
echo === nginx report.heliontracking.com references ===
findstr /s /n /i "report.heliontracking.com" C:\nginx\nginx-1.30.0\conf\*
endlocal
