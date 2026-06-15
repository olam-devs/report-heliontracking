param(
  [Parameter(Mandatory = $true)]
  [string]$ConfPath
)

$lines = @(Get-Content -LiteralPath $ConfPath)
$out = New-Object System.Collections.Generic.List[string]

foreach ($line in $lines) {
  if ($line -match 'helion-report-fleet\.conf') { continue }
  if ($line -match 'helion-report-portal|nginx-report-portal|report-portal\.conf') {
    $out.Add('# disabled by fleet-incident-reporter: ' + $line.Trim())
    continue
  }
  $out.Add($line)
}

$inserted = $false
for ($i = 0; $i -lt $out.Count; $i++) {
  if ($out[$i] -match 'include\s+mime\.types') {
    $out.Insert($i + 1, '    include helion-report-fleet.conf;')
    $inserted = $true
    break
  }
}

if (-not $inserted) {
  for ($i = 0; $i -lt $out.Count; $i++) {
    if ($out[$i] -match '^\s*http\s*\{') {
      $out.Insert($i + 1, '    include helion-report-fleet.conf;')
      $inserted = $true
      break
    }
  }
}

if (-not $inserted) {
  Write-Error 'Could not find http { } block in nginx.conf'
  exit 1
}

$out | Set-Content -LiteralPath $ConfPath -Encoding ascii
Write-Host 'Placed include helion-report-fleet.conf inside http block'
