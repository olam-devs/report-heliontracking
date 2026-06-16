@echo off
REM =====================================================================
REM  vps-nginx-debug.cmd  —  Diagnose why report.heliontracking.com
REM  still routes to CMSV/Tomcat instead of Node:3002
REM
REM  Run this ON THE VPS (RDP or SSH).  Share the full output.
REM =====================================================================
setlocal enabledelayedexpansion

echo.
echo ================================================================
echo  1. WHICH PROCESS IS LISTENING ON 443?
echo ================================================================
netstat -ano | findstr ":443"
echo.
echo --- Process details for every PID on :443 ---
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":443 " ^| findstr "LISTENING"') do (
    echo PID %%P:
    wmic process where processid=%%P get ProcessId,CommandLine /format:list 2>nul
    echo.
)

echo.
echo ================================================================
echo  2. CMSV NGINX BINARY AND CONFIG PATH (PID 28228 or current)
echo ================================================================
wmic process where "name='nginx.exe'" get ProcessId,CommandLine /format:list 2>nul

echo.
echo ================================================================
echo  3. TEST nginx -t FROM THE CMSV BINARY
echo     (proves which config it is actually testing)
echo ================================================================
set CMSV_NGINX="C:\Program Files\CMSServerV6\nginx\nginx.exe"
if exist %CMSV_NGINX% (
    echo Found CMSV nginx binary, running -t:
    %CMSV_NGINX% -t 2>&1
    echo.
    echo Running nginx -T to dump server_name blocks:
    %CMSV_NGINX% -T 2>&1 | findstr /i "server_name\|proxy_pass\|ssl_cert\|X-Report\|__whoami\|listen\|include"
) else (
    echo CMSV nginx binary not found at expected path.
    echo Searching...
    where nginx.exe 2>nul
)

echo.
echo ================================================================
echo  4. SNI/HOST ROUTING TEST — forced Host header to localhost
echo     (isolates DNS, proves vhost selection)
echo ================================================================
echo --- /__whoami (should return REPORT-SERVER-BLOCK if vhost works) ---
curl -sk https://127.0.0.1/__whoami -H "Host: report.heliontracking.com"
echo.
echo --- /api/health via forced host ---
curl -sk https://127.0.0.1/api/health -H "Host: report.heliontracking.com"
echo.
echo --- X-Report-Fleet header present? ---
curl -skI https://127.0.0.1/ -H "Host: report.heliontracking.com" | findstr /i "X-Report\|server\|location\|JSESSIONID"
echo.

echo.
echo ================================================================
echo  5. NGINX ACCESS + ERROR LOGS (last 30 lines each)
echo ================================================================
set CMSV_LOG="C:\Program Files\CMSServerV6\nginx\logs"
if exist %CMSV_LOG% (
    echo --- error.log ---
    powershell -Command "Get-Content '%CMSV_LOG%\error.log' -Tail 30 2>$null"
    echo.
    echo --- access.log ---
    powershell -Command "Get-Content '%CMSV_LOG%\access.log' -Tail 30 2>$null"
) else (
    echo CMSV log dir not found at expected path.
)

echo.
echo ================================================================
echo  6. CMSV nginx.conf — server blocks summary
echo ================================================================
set CMSV_CONF="C:\Program Files\CMSServerV6\nginx\conf\nginx.conf"
if exist %CMSV_CONF% (
    findstr /n /i "server_name\|listen\|proxy_pass\|include\|ssl_cert\|X-Report" %CMSV_CONF%
) else (
    echo nginx.conf not found at %CMSV_CONF%
)

echo.
echo ================================================================
echo  7. INCLUDED CONF FILES IN CMSV nginx\conf\
echo ================================================================
dir "C:\Program Files\CMSServerV6\nginx\conf\" 2>nul

echo.
echo ================================================================
echo  8. SSL CERT FILES EXIST?
echo ================================================================
if exist "C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-chain.pem" (
    echo [OK] chain.pem exists
    powershell -Command "& 'C:\Program Files\Git\usr\bin\openssl.exe' x509 -noout -subject -issuer -dates -in 'C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-chain.pem' 2>$null" 2>nul
) else (
    echo [MISSING] C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-chain.pem
)
if exist "C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-key.pem" (
    echo [OK] key.pem exists
) else (
    echo [MISSING] C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-key.pem
)

echo.
echo ================================================================
echo  DONE — paste full output above to diagnose routing
echo ================================================================
endlocal
