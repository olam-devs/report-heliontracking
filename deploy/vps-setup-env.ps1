# Create C:\helion\fleet-incident-reporter\.env from template + helion middleware CMS creds
param(
  [string]$AppRoot = 'C:\helion\fleet-incident-reporter',
  [string]$MiddlewareEnv = 'C:\helion\middleware\.env'
)

$ErrorActionPreference = 'Stop'
$example = Join-Path $AppRoot 'deploy\.env.vps.example'
$target = Join-Path $AppRoot '.env'

if (-not (Test-Path $example)) {
  Write-Error "Run vps-extract-code.cmd first. Missing $example"
}

$lines = Get-Content $example

function Read-EnvFile($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $map[$k.Trim()] = $v.Trim()
  }
  return $map
}

$mw = Read-EnvFile $MiddlewareEnv

$cmsUrl = if ($mw['CMSV6_BASE_URL']) { $mw['CMSV6_BASE_URL'] } else { 'http://127.0.0.1:8080' }
$cmsUrl = $cmsUrl -replace '/808gps/?$', '' -replace '/$', ''
$cmsUser = if ($mw['CMSV6_USERNAME']) { $mw['CMSV6_USERNAME'] } elseif ($mw['CMSV6_USER']) { $mw['CMSV6_USER'] } else { 'helion' }
$cmsPass = if ($mw['CMSV6_PASSWORD']) { $mw['CMSV6_PASSWORD'] } elseif ($mw['CMSV6_PASS']) { $mw['CMSV6_PASS'] } else { '' }

$jwt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

$out = $lines | ForEach-Object {
  $line = $_
  if ($line -match '^CMSV6_BASE_URL=') { return "CMSV6_BASE_URL=$cmsUrl" }
  if ($line -match '^CMSV6_USERNAME=') { return "CMSV6_USERNAME=$cmsUser" }
  if ($line -match '^CMSV6_PASSWORD=') { return "CMSV6_PASSWORD=$cmsPass" }
  if ($line -match '^JWT_SECRET=') { return "JWT_SECRET=$jwt" }
  if ($line -match '^DB_USER=') { return 'DB_USER=root' }
  if ($line -match '^DB_PASS=') { return 'DB_PASS=' }
  $line
}

# Use shared helion daily-log if it exists
$sharedLog = 'C:\helion\data\daily-log.json'
if (Test-Path $sharedLog) {
  $out += ''
  $out += 'DAILY_LOG_FILE=C:/helion/data/daily-log.json'
  $sharedGeo = 'C:\helion\data\geocode-cache.json'
  if (Test-Path $sharedGeo) {
    $out += 'GEOCODE_CACHE_FILE=C:/helion/data/geocode-cache.json'
  }
}

$out | Set-Content -Encoding UTF8 $target
Write-Host "Created $target"
Write-Host "CMS: $cmsUrl user=$cmsUser"
if (-not $cmsPass) { Write-Warning 'CMS password empty — edit .env manually' }
