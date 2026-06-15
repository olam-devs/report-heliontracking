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

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conf = '%CONF%';" ^
  "$lines = @(Get-Content -LiteralPath $conf);" ^
  "$out = New-Object System.Collections.Generic.List[string];" ^
  "$hasFleet = $false;" ^
  "$removedTrailing = $false;" ^
  "for ($i = 0; $i -lt $lines.Count; $i++) {" ^
  "  $line = $lines[$i];" ^
  "  if ($line -match 'helion-report-fleet\.conf') { $hasFleet = $true; $out.Add($line); continue }" ^
  "  if ($line -match 'helion-report-portal|nginx-report-portal|report-portal\.conf') { $out.Add('    # disabled by fleet-incident-reporter: ' + $line.Trim()); continue }" ^
  "  if (-not $removedTrailing -and $i -ge ($lines.Count - 3) -and $line -match '^\s*include\s+helion-report-fleet\.conf\s*;\s*$') { $removedTrailing = $true; continue }" ^
  "  $out.Add($line)" ^
  "}" ^
  "if (-not $hasFleet) {" ^
  "  $inserted = $false;" ^
  "  for ($i = 0; $i -lt $out.Count; $i++) {" ^
  "    if (-not $inserted -and $out[$i] -match 'include\s+mime\.types') {" ^
  "      $out.Insert($i + 1, '    include helion-report-fleet.conf;');" ^
  "      $inserted = $true;" ^
  "      break" ^
  "    }" ^
  "  }" ^
  "  if (-not $inserted) {" ^
  "    for ($i = 0; $i -lt $out.Count; $i++) {" ^
  "      if (-not $inserted -and $out[$i] -match '^\s*http\s*\{') {" ^
  "        $out.Insert($i + 1, '    include helion-report-fleet.conf;');" ^
  "        $inserted = $true;" ^
  "        break" ^
  "      }" ^
  "    }" ^
  "  }" ^
  "  if (-not $inserted) { Write-Error 'Could not find http { } block in nginx.conf'; exit 1 }" ^
  "  Write-Host 'Added include helion-report-fleet.conf inside http block'" ^
  "} else { Write-Host 'helion-report-fleet.conf already referenced in nginx.conf' }" ^
  "$out | Set-Content -LiteralPath $conf -Encoding ascii"

if errorlevel 1 (
  echo ERROR: failed to update nginx.conf
  exit /b 1
)

cd /d "%NGINX%"
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
