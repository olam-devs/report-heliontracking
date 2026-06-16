@echo off
REM =====================================================================
REM  vps-nginx-fix.cmd  —  Wire report.heliontracking.com → Node:3002
REM
REM  SAFE: only adds a new server{} block for report.heliontracking.com
REM        Does NOT touch heliontracking.com or any CMSV block.
REM
REM  Run ON THE VPS as Administrator (right-click → Run as administrator)
REM  or from an elevated command prompt.
REM =====================================================================
setlocal enabledelayedexpansion

set CMSV_PREFIX=C:\Program Files\CMSServerV6\nginx
set CMSV_NGINX=%CMSV_PREFIX%\nginx.exe
set CMSV_CONF=%CMSV_PREFIX%\conf\nginx.conf
set FLEET_CONF=%CMSV_PREFIX%\conf\helion-report-fleet.conf
set SSL_CHAIN=C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-chain.pem
set SSL_KEY=C:\nginx\nginx-1.30.0\ssl\report.heliontracking.com-key.pem

echo.
echo ================================================================
echo  PRE-FLIGHT
echo ================================================================

if not exist "%CMSV_NGINX%" (
    echo [FAIL] %CMSV_NGINX% not found.  exit.
    exit /b 1
)
echo [OK] CMSV nginx binary found.

if not exist "%SSL_CHAIN%" (
    echo [FAIL] SSL chain missing: %SSL_CHAIN%
    exit /b 1
)
echo [OK] SSL chain present.

if not exist "%SSL_KEY%" (
    echo [FAIL] SSL key missing: %SSL_KEY%
    exit /b 1
)
echo [OK] SSL key present.

echo.
echo ================================================================
echo  STEP 1: Show current nginx.conf (so we know what's there)
echo ================================================================
type "%CMSV_CONF%"

echo.
echo ================================================================
echo  STEP 2: Write helion-report-fleet.conf into CMSV conf dir
echo          (ONLY touches report.heliontracking.com — nothing else)
echo ================================================================

(
echo # Fleet Incident Reporter — report.heliontracking.com
echo # Written by vps-nginx-fix.cmd  — safe to re-run
echo server {
echo     listen 443 ssl;
echo     server_name report.heliontracking.com;
echo.
echo     ssl_certificate     C:/nginx/nginx-1.30.0/ssl/report.heliontracking.com-chain.pem;
echo     ssl_certificate_key C:/nginx/nginx-1.30.0/ssl/report.heliontracking.com-key.pem;
echo.
echo     client_max_body_size 50m;
echo     proxy_read_timeout   600s;
echo     proxy_connect_timeout 60s;
echo     proxy_send_timeout   600s;
echo.
echo     add_header X-Report-Fleet yes always;
echo.
echo     location = /__whoami {
echo         return 200 "REPORT-SERVER-BLOCK\n";
echo     }
echo.
echo     location / {
echo         proxy_pass http://127.0.0.1:3002;
echo         proxy_http_version 1.1;
echo         proxy_set_header Upgrade $http_upgrade;
echo         proxy_set_header Connection "upgrade";
echo         proxy_set_header Host $host;
echo         proxy_set_header X-Real-IP $remote_addr;
echo         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
echo         proxy_set_header X-Forwarded-Proto $scheme;
echo     }
echo }
echo.
echo server {
echo     listen 80;
echo     server_name report.heliontracking.com;
echo     location /.well-known/acme-challenge/ {
echo         root C:/win-acme/webroot;
echo     }
echo     location / {
echo         return 301 https://$host$request_uri;
echo     }
echo }
) > "%FLEET_CONF%"
echo [OK] Wrote %FLEET_CONF%

echo.
echo ================================================================
echo  STEP 3: Ensure nginx.conf includes helion-report-fleet.conf
echo ================================================================
findstr /i "helion-report-fleet" "%CMSV_CONF%" >nul 2>&1
if %errorlevel% == 0 (
    echo [SKIP] include already present in nginx.conf
) else (
    echo [INFO] Injecting include into nginx.conf via PowerShell...
    powershell -ExecutionPolicy Bypass -Command ^
        "$path = 'C:\Program Files\CMSServerV6\nginx\conf\nginx.conf';" ^
        "$lines = Get-Content -LiteralPath $path -Encoding ascii;" ^
        "$out = [System.Collections.Generic.List[string]]::new();" ^
        "$inserted = $false;" ^
        "foreach ($line in $lines) {" ^
        "  $out.Add($line);" ^
        "  if (-not $inserted -and $line -match 'mime\.types') {" ^
        "    $out.Add('    include helion-report-fleet.conf;');" ^
        "    $inserted = $true;" ^
        "  }" ^
        "}" ^
        "if (-not $inserted) {" ^
        "  foreach ($i in 0..($out.Count-1)) {" ^
        "    if ($out[$i] -match '^\s*http\s*\{') {" ^
        "      $out.Insert($i+1,'    include helion-report-fleet.conf;');" ^
        "      $inserted = $true; break;" ^
        "    }" ^
        "  }" ^
        "}" ^
        "if (-not $inserted) { Write-Error 'Cannot find insert point'; exit 1 }" ^
        "$out | Set-Content -LiteralPath $path -Encoding ascii;" ^
        "Write-Host '[OK] include injected'"
    if errorlevel 1 (
        echo [FAIL] Could not inject include automatically.
        echo        Manually add this line inside the http { } block in:
        echo        %CMSV_CONF%
        echo            include helion-report-fleet.conf;
        exit /b 1
    )
)

echo.
echo ================================================================
echo  STEP 4: Test config using CMSV binary WITH correct -p prefix
echo ================================================================
"%CMSV_NGINX%" -p "%CMSV_PREFIX%\" -t
if errorlevel 1 (
    echo [FAIL] Config test failed — fix errors above.
    exit /b 1
)
echo [OK] Config test passed.

echo.
echo ================================================================
echo  STEP 5: Reload nginx using ELEVATED PowerShell
echo          (previous reloads failed: Access Denied — this fixes it)
echo ================================================================
powershell -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath 'C:\Program Files\CMSServerV6\nginx\nginx.exe'" ^
    " -ArgumentList '-p','C:\Program Files\CMSServerV6\nginx\','-s','reload'" ^
    " -Verb RunAs -Wait"
echo [OK] Reload signal sent.

echo.
echo ================================================================
echo  STEP 6: Smoke test (wait 3s for workers to respawn)
echo ================================================================
timeout /t 3 /nobreak >nul

echo --- /__whoami (expect: REPORT-SERVER-BLOCK) ---
curl -sk https://127.0.0.1/__whoami -H "Host: report.heliontracking.com"
echo.

echo --- /api/health (expect: JSON ok) ---
curl -sk https://127.0.0.1/api/health -H "Host: report.heliontracking.com"
echo.

echo --- heliontracking.com still alive? ---
curl -sk https://127.0.0.1/ -H "Host: heliontracking.com" -o nul -w "HTTP %%{http_code}"
echo.

echo.
echo ================================================================
echo  DONE
echo  If /__whoami = REPORT-SERVER-BLOCK and heliontracking.com = 200/302/303
echo  open https://report.heliontracking.com in browser.
echo ================================================================
endlocal
