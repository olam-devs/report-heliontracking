# Zip project source for VPS (no node_modules, no local data secrets in tracking if huge — include all)
# Output: deploy\out\fleet-code.zip → copy to VPS C:\helion\_import\fleet-code.zip

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$OutDir = Join-Path $PSScriptRoot 'out'
$Zip = Join-Path $OutDir 'fleet-code.zip'
if (Test-Path $Zip) { Remove-Item -Force $Zip }

Push-Location $Root
try {
  tar -acf $Zip `
    --exclude=node_modules `
    --exclude=client/node_modules `
    --exclude=.git `
    --exclude=uploads `
    --exclude=data `
    --exclude=deploy/out `
    --exclude=.env `
    --exclude=client/dist `
    .
} finally {
  Pop-Location
}

Write-Host ''
Write-Host '=== Code pack ready ===' -ForegroundColor Green
Write-Host "Zip: $Zip"
Write-Host ''
Write-Host 'Copy to VPS: C:\helion\_import\fleet-code.zip'
Write-Host 'Then on VPS run: deploy\vps-extract-code.cmd'
Write-Host ''
