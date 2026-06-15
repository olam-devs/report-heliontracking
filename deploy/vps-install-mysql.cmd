@echo off
REM Helion VPS — MySQL not installed? Run this as Administrator
setlocal

echo === Check for existing MySQL/MariaDB/XAMPP ===
if exist "C:\xampp\mysql\bin\mysqld.exe" (
  echo FOUND XAMPP MySQL at C:\xampp\mysql
  echo Start it from XAMPP Control Panel, then run:
  echo   C:\helion\fleet-incident-reporter\deploy\vps-fix-mysql-and-start.cmd
  pause
  exit /b 0
)
if exist "C:\Program Files\MariaDB 10.11\bin\mysql.exe" (
  echo FOUND MariaDB — use DB_PORT in .env if not 3306
  goto winget_try
)

echo No MySQL/MariaDB found on this server.
echo.

:winget_try
where winget >nul 2>&1
if errorlevel 1 goto manual

echo === Trying winget install MySQL 8 ===
winget install --id Oracle.MySQL -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto manual

echo.
echo After install completes, set root password if prompted, then edit:
echo   C:\helion\fleet-incident-reporter\.env
echo   DB_PASS=your_password
echo.
echo Then run:
echo   C:\helion\fleet-incident-reporter\deploy\vps-fix-mysql-and-start.cmd
pause
exit /b 0

:manual
echo.
echo ============================================================
echo  MANUAL INSTALL (5 minutes on VPS browser)
echo ============================================================
echo.
echo 1. On the VPS open browser:
echo    https://dev.mysql.com/downloads/installer/
echo.
echo 2. Download "MySQL Installer for Windows" (mysql-installer-web)
echo.
echo 3. Run installer, choose "Custom", add:
echo    - MySQL Server 8.x
echo    - MySQL Shell (optional)
echo.
echo 4. Configuration:
echo    - Port: 3306
echo    - Root password: pick one and REMEMBER it
echo    - Windows Service: MySQL80, Start at boot
echo.
echo 5. Edit C:\helion\fleet-incident-reporter\.env
echo    DB_USER=root
echo    DB_PASS=the_password_you_chose
echo.
echo 6. Run:
echo    C:\helion\fleet-incident-reporter\deploy\vps-fix-mysql-and-start.cmd
echo.
echo ============================================================
pause
endlocal
