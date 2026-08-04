@echo off
echo [1/6] Pulling latest code...
cd C:\helion\_repo\fleet-incident-reporter
git pull

echo [2/6] Copying backend files...
copy "src\controllers\mechanicController.js" "C:\helion\fleet-incident-reporter\src\controllers\mechanicController.js" /Y
copy "src\routes\mechanic.js" "C:\helion\fleet-incident-reporter\src\routes\mechanic.js" /Y
copy "src\models\MechanicModel.js" "C:\helion\fleet-incident-reporter\src\models\MechanicModel.js" /Y
copy "src\middleware\uploadMechanic.js" "C:\helion\fleet-incident-reporter\src\middleware\uploadMechanic.js" /Y
copy "src\config\db.js" "C:\helion\fleet-incident-reporter\src\config\db.js" /Y
copy "server.js" "C:\helion\fleet-incident-reporter\server.js" /Y
copy "run-migrate-v9.js" "C:\helion\fleet-incident-reporter\run-migrate-v9.js" /Y
copy "run-migrate-v10.js" "C:\helion\fleet-incident-reporter\run-migrate-v10.js" /Y

echo [3/6] Copying frontend files...
copy "client\src\App.jsx" "C:\helion\fleet-incident-reporter\client\src\App.jsx" /Y
copy "client\src\components\Layout.jsx" "C:\helion\fleet-incident-reporter\client\src\components\Layout.jsx" /Y
copy "client\src\pages\MechanicPortal.jsx" "C:\helion\fleet-incident-reporter\client\src\pages\MechanicPortal.jsx" /Y
copy "client\src\pages\CaseDetail.jsx" "C:\helion\fleet-incident-reporter\client\src\pages\CaseDetail.jsx" /Y
copy "client\src\pages\Users.jsx" "C:\helion\fleet-incident-reporter\client\src\pages\Users.jsx" /Y

echo [4/6] Building frontend...
cd C:\helion\fleet-incident-reporter\client
call npm run build

echo [5/6] Restarting server...
cd C:\helion\fleet-incident-reporter
powershell -NoProfile -Command "pm2 stop helion-fleet-reporter; netstat -ano | Where-Object {$_ -match ':3002\s+\S+\s+LISTENING'} | ForEach-Object {$p=($_.Trim() -split '\s+')[-1]; taskkill /PID $p /F 2>$null}; pm2 start helion-fleet-reporter --update-env"

echo [6/6] Done!
pause
