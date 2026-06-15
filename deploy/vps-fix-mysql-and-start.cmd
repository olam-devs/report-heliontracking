@echo off
REM Find MySQL on Windows VPS, start service, run Node migrations, start PM2
setlocal
set APP=C:\helion\fleet-incident-reporter
cd /d "%APP%"

echo === Looking for MySQL service ===
for %%S in (MySQL80 MySQL MySQL57 MariaDB) do (
  sc query %%S 2>nul | findstr /I "STATE" | findstr /I "RUNNING" >nul && (
    echo Service %%S is running
    goto migrate
  )
  sc query %%S 2>nul | findstr /I "STATE" >nul && (
    echo Starting service %%S ...
    net start %%S
    goto migrate
  )
)

echo.
echo MySQL service not found. Check common installs:
if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" echo   Found: C:\Program Files\MySQL\MySQL Server 8.0
if exist "C:\xampp\mysql\bin\mysqld.exe" echo   Found: XAMPP MySQL at C:\xampp\mysql

echo.
echo OPTION A - Start XAMPP MySQL:
echo   Open XAMPP Control Panel and start MySQL
echo.
echo OPTION B - Install MySQL 8:
echo   Download from https://dev.mysql.com/downloads/installer/
echo   Set root password, then edit %APP%\.env DB_PASS=
echo.
echo OPTION C - If MySQL runs on another host/port, edit %APP%\.env
echo.
pause
exit /b 1

:migrate
echo.
echo === Running migrations (Node, no mysql CLI needed) ===
node db\run-migrations.js
if errorlevel 1 (
  echo Migration failed — check DB_USER and DB_PASS in %APP%\.env
  notepad %APP%\.env
  pause
  exit /b 1
)
node db\apply-v6.js

echo.
echo === PM2 start ===
pm2 delete helion-fleet-reporter 2>nul
pm2 start deploy\ecosystem.config.cjs --update-env
pm2 save

timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:3002/api/health
echo.
pm2 status
endlocal
