@echo off
REM =====================================================================
REM  vps-nginx-fix.cmd  — Fix report.heliontracking.com routing
REM
REM  Run as Administrator (right-click -> Run as administrator)
REM
REM  Situation: nginx.conf already has the report server block inline
REM  (added by Cursor AI). A previous run of this script added a
REM  duplicate via include helion-report-fleet.conf — that causes
REM  nginx -t to fail. This script cleans up the duplicate, verifies
REM  the config, and reloads nginx correctly.
REM =====================================================================
setlocal enabledelayedexpansion

set CMSV_PREFIX=C:\Program Files\CMSServerV6\nginx
set CMSV_NGINX="%CMSV_PREFIX%\nginx.exe"
set CMSV_CONF=%CMSV_PREFIX%\conf\nginx.conf
set FLEET_CONF=%CMSV_PREFIX%\conf\helion-report-fleet.conf

echo.
echo ================================================================
echo  STEP 1: Remove duplicate include (added by previous fix run)
echo ================================================================

REM Remove helion-report-fleet.conf (the inline block already has it)
if exist "%FLEET_CONF%" (
    del /f "%FLEET_CONF%"
    echo [OK] Deleted duplicate %FLEET_CONF%
) else (
    echo [SKIP] No duplicate conf file found.
)

REM Remove the injected include line from nginx.conf
findstr /i "helion-report-fleet" "%CMSV_CONF%" >nul 2>&1
if %errorlevel% == 0 (
    echo [INFO] Removing injected include line from nginx.conf...
    powershell -ExecutionPolicy Bypass -Command ^
        "$path = 'C:\Program Files\CMSServerV6\nginx\conf\nginx.conf';" ^
        "$lines = Get-Content -LiteralPath $path -Encoding ascii;" ^
        "$out = $lines | Where-Object { $_ -notmatch 'helion-report-fleet' };" ^
        "$out | Set-Content -LiteralPath $path -Encoding ascii;" ^
        "Write-Host '[OK] Removed include line from nginx.conf'"
) else (
    echo [SKIP] No include line to remove.
)

echo.
echo ================================================================
echo  STEP 2: Confirm report server block is in nginx.conf
echo ================================================================
findstr /i "report.heliontracking.com" "%CMSV_CONF%" >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] report.heliontracking.com server block present in nginx.conf
) else (
    echo [WARN] No report server block found! Adding it now...
    powershell -ExecutionPolicy Bypass -Command ^
        "$path = 'C:\Program Files\CMSServerV6\nginx\conf\nginx.conf';" ^
        "$lines = Get-Content -LiteralPath $path -Encoding ascii -Raw;" ^
        "$block = \"`nserver {`n    listen 443 ssl;`n    server_name report.heliontracking.com;`n    ssl_certificate     \`\"C:/nginx/nginx-1.30.0/ssl/report.heliontracking.com-chain.pem\`\";`n    ssl_certificate_key \`\"C:/nginx/nginx-1.30.0/ssl/report.heliontracking.com-key.pem\`\";`n    client_max_body_size 50m;`n    proxy_read_timeout 600s;`n    add_header X-Report-Fleet yes always;`n    location = /__whoami { return 200 \`\"REPORT-SERVER-BLOCK\n\`\"; }`n    location / {`n        proxy_pass http://127.0.0.1:3002;`n        proxy_http_version 1.1;`n        proxy_set_header Host \$host;`n        proxy_set_header X-Real-IP \$remote_addr;`n        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;`n        proxy_set_header X-Forwarded-Proto \$scheme;`n    }`n}`n\";" ^
        "$lines = $lines -replace '(}\s*$)', \"`$block`$1\";" ^
        "Set-Content -LiteralPath $path -Value $lines -Encoding ascii;" ^
        "Write-Host '[OK] Added report server block'"
)

echo.
echo ================================================================
echo  STEP 3: ALSO remove default_server from report block
echo          (default_server causes it to steal all unmatched TLS)
echo ================================================================
findstr /i "default_server" "%CMSV_CONF%" >nul 2>&1
if %errorlevel% == 0 (
    echo [INFO] Removing default_server flag from report block...
    powershell -ExecutionPolicy Bypass -Command ^
        "$path = 'C:\Program Files\CMSServerV6\nginx\conf\nginx.conf';" ^
        "$lines = Get-Content -LiteralPath $path -Encoding ascii;" ^
        "$out = $lines -replace '443\s+ssl\s+default_server', '443 ssl';" ^
        "$out | Set-Content -LiteralPath $path -Encoding ascii;" ^
        "Write-Host '[OK] Removed default_server flag'"
) else (
    echo [SKIP] No default_server flag found.
)

echo.
echo ================================================================
echo  STEP 4: Test config with correct CMSV prefix
echo ================================================================
%CMSV_NGINX% -p "%CMSV_PREFIX%\" -t 2>&1
if errorlevel 1 (
    echo.
    echo [FAIL] Config test failed. Show the error above to diagnose.
    echo        Most likely: a stray character or extra directive.
    echo        Check nginx.conf manually around the report server block.
    exit /b 1
)
echo [OK] Config test passed.

echo.
echo ================================================================
echo  STEP 5: Reload CMSV nginx via Windows Service (safe method)
echo          Finds the service that owns nginx PID 28228 and sends
echo          a graceful reload without restarting Tomcat/CMSV.
echo ================================================================

REM Try to find the service name for CMSV nginx
set SVC_NAME=
for /f "tokens=1" %%S in ('sc query state^= all ^| findstr /i "SERVICE_NAME"') do (
    set MAYBE=%%S
)

REM Most common CMSV service names to try
set SERVICES=CMSServerV6 CMSV6 CMSServer nginx

for %%S in (%SERVICES%) do (
    sc query "%%S" >nul 2>&1
    if !errorlevel! == 0 (
        echo [INFO] Found Windows service: %%S
        set SVC_NAME=%%S
        goto :found_svc
    )
)

:found_svc
if defined SVC_NAME (
    echo [INFO] Using service control: sc stop / sc start "%SVC_NAME%"
    echo        This gracefully restarts nginx only — Tomcat is separate.
    sc stop "%SVC_NAME%"
    timeout /t 3 /nobreak >nul
    sc start "%SVC_NAME%"
    timeout /t 3 /nobreak >nul
) else (
    echo [INFO] No known service found — trying elevated nginx -s reload...
    powershell -ExecutionPolicy Bypass -Command ^
        "Start-Process -FilePath 'C:\Program Files\CMSServerV6\nginx\nginx.exe'" ^
        " -ArgumentList '-p','C:\Program Files\CMSServerV6\nginx\','-s','reload'" ^
        " -Verb RunAs -Wait -WindowStyle Hidden"
    timeout /t 3 /nobreak >nul
)

echo.
echo ================================================================
echo  STEP 6: Smoke tests
echo ================================================================

echo --- /__whoami via HTTPS (expect: REPORT-SERVER-BLOCK) ---
curl -sk https://127.0.0.1/__whoami -H "Host: report.heliontracking.com"
echo.

echo --- /api/health (expect: JSON with status ok) ---
curl -sk https://127.0.0.1/api/health -H "Host: report.heliontracking.com"
echo.

echo --- heliontracking.com still works? (expect: 200 or 302) ---
curl -sk https://127.0.0.1/ -H "Host: heliontracking.com" -o nul -w "HTTP %%{http_code}"
echo.

echo --- Public URL test ---
curl -sk https://report.heliontracking.com/api/health
echo.

echo.
echo ================================================================
echo  DONE
echo  If /__whoami = REPORT-SERVER-BLOCK -> open https://report.heliontracking.com
echo  If still CMSV response -> paste output here for next step
echo ================================================================
endlocal
