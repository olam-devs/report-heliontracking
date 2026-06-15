# Import data pack onto VPS — backs up existing data first.
# Expects: C:\helion\_import\fleet-data-pack.zip
# Or pass path: .\vps-import-data.ps1 -ZipPath D:\fleet-data-pack.zip

param(
  [string]$ZipPath = 'C:\helion\_import\fleet-data-pack.zip',
  [string]$AppRoot = 'C:\helion\fleet-incident-reporter',
  [switch]$SkipDailyLog
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ZipPath)) {
  Write-Error "Data pack not found: $ZipPath"
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = "C:\helion\_backup\fleet-data-before-import-$Stamp"
$Stage = Join-Path $env:TEMP "fleet-data-import-$Stamp"

if (Test-Path "$AppRoot\data") {
  New-Item -ItemType Directory -Force -Path $Backup | Out-Null
  Copy-Item -Recurse -Force "$AppRoot\data" "$Backup\data"
  Write-Host "Backed up existing data to $Backup"
}

Expand-Archive -Path $ZipPath -DestinationPath $Stage -Force

$dataSrc = Join-Path $Stage 'data'
if (-not (Test-Path $dataSrc)) {
  Write-Error 'Invalid pack: missing data/ folder'
}

New-Item -ItemType Directory -Force -Path "$AppRoot\data\tracking" | Out-Null

$trackingFiles = @(
  'notifications.json',
  'notification-reads.json',
  'notification-coverage.json',
  'danger-zones.json'
)
foreach ($f in $trackingFiles) {
  $src = Join-Path $dataSrc "tracking\$f"
  if (Test-Path $src) {
    Copy-Item -Force $src "$AppRoot\data\tracking\$f"
    Write-Host "Imported tracking/$f"
  }
}

if (-not $SkipDailyLog) {
  $dl = Join-Path $dataSrc 'daily-log.json'
  if (Test-Path $dl) {
    Copy-Item -Force $dl "$AppRoot\data\daily-log.json"
    Write-Host 'Imported data/daily-log.json'
  }
} else {
  Write-Host 'Skipped daily-log.json (VPS copy kept) — use -SkipDailyLog:$false to import'
}

$geo = Join-Path $dataSrc 'geocode-cache.json'
if (Test-Path $geo) {
  Copy-Item -Force $geo "$AppRoot\data\geocode-cache.json"
  Write-Host 'Imported data/geocode-cache.json'
}

Remove-Item -Recurse -Force $Stage
Write-Host ''
Write-Host '=== Data import complete ===' -ForegroundColor Green
Write-Host "App data: $AppRoot\data"
Write-Host 'Restart app: pm2 restart helion-fleet-reporter'
