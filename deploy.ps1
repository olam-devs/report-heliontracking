param([switch]$SkipBuild)

Write-Host "[deploy] Stopping fleet-reporter..." -ForegroundColor Cyan
pm2 stop helion-fleet-reporter 2>$null

Write-Host "[deploy] Clearing port 3002..." -ForegroundColor Cyan
$listening = netstat -ano | Select-String ':3002\s+.*LISTENING'
foreach ($line in $listening) {
    $procId = ($line.ToString().Trim() -split '\s+')[-1]
    if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
        Write-Host "  Killing PID $procId"
        taskkill /F /PID $procId 2>$null | Out-Null
    }
}
Start-Sleep -Seconds 2

if (-not $SkipBuild) {
    Write-Host "[deploy] Building frontend..." -ForegroundColor Cyan
    Push-Location client
    npm run build
    Pop-Location
}

Write-Host "[deploy] Starting fleet-reporter..." -ForegroundColor Cyan
pm2 startOrRestart ecosystem.json

Start-Sleep -Seconds 3
pm2 logs helion-fleet-reporter --lines 4 --nostream
Write-Host "[deploy] Done." -ForegroundColor Green
