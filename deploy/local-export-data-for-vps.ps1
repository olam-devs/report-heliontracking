# Export LOCAL fleet-incident-reporter data for VPS (notifications, daily-log, etc.)
# Run on your PC before first VPS deploy.
# Output: deploy\out\fleet-data-pack.zip — copy to VPS C:\helion\_import\fleet-data-pack.zip

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$OutDir = Join-Path $PSScriptRoot 'out'
$Zip = Join-Path $OutDir 'fleet-data-pack.zip'
$Stage = Join-Path $OutDir "fleet-data-pack-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

New-Item -ItemType Directory -Force -Path $Stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'data\tracking') | Out-Null

$manifest = [ordered]@{
  exportedAt = (Get-Date).ToString('o')
  hostname   = $env:COMPUTERNAME
  files      = @()
}

function Copy-IfExists($rel) {
  $src = Join-Path $Root $rel
  if (-not (Test-Path $src)) { return }
  $dest = Join-Path $Stage $rel
  $dir = Split-Path $dest -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Copy-Item -Force $src $dest
  $manifest.files += $rel
}

Copy-IfExists 'data\daily-log.json'
Copy-IfExists 'data\geocode-cache.json'
Copy-IfExists 'data\tracking\notifications.json'
Copy-IfExists 'data\tracking\notification-reads.json'
Copy-IfExists 'data\tracking\notification-coverage.json'
Copy-IfExists 'data\tracking\danger-zones.json'

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Stage 'manifest.json')

if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -Force
Remove-Item -Recurse -Force $Stage

Write-Host ''
Write-Host '=== Local data pack ready ===' -ForegroundColor Green
Write-Host "Zip: $Zip"
Write-Host ''
Write-Host 'Files included:'
$manifest.files | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Copy fleet-data-pack.zip to VPS: C:\helion\_import\fleet-data-pack.zip'
Write-Host '  2. On VPS run: deploy\vps-import-data.ps1'
Write-Host '  3. Then run: deploy\vps-deploy.cmd'
Write-Host ''
