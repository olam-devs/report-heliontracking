# VPS — export live data before major deploy (safety backup)
# Output: C:\helion\_export\fleet-data-backup.zip

$ErrorActionPreference = 'Stop'
$App = 'C:\helion\fleet-incident-reporter'
$ExportRoot = 'C:\helion\_export'
$Zip = Join-Path $ExportRoot 'fleet-data-backup.zip'
$Stage = Join-Path $ExportRoot "fleet-data-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

if (-not (Test-Path "$App\data")) {
  Write-Error "No data folder at $App\data"
}

New-Item -ItemType Directory -Force -Path $Stage | Out-Null
Copy-Item -Recurse -Force "$App\data" (Join-Path $Stage 'data')
if (Test-Path "$App\.env") {
  Copy-Item -Force "$App\.env" (Join-Path $Stage '.env')
}

if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -Force
Remove-Item -Recurse -Force $Stage

Write-Host "Backup saved: $Zip"
