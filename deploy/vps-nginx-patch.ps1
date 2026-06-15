param(
  [Parameter(Mandatory = $true)]
  [string]$ConfPath
)

function Disable-InlineReportServerBlocks {
  param([string[]]$Lines)
  $out = New-Object System.Collections.Generic.List[string]
  $i = 0
  while ($i -lt $Lines.Count) {
    if ($Lines[$i] -match '^\s*server\s*\{') {
      $block = New-Object System.Collections.Generic.List[string]
      $depth = 0
      $j = $i
      do {
        $line = $Lines[$j]
        $block.Add($line)
        $depth += ([regex]::Matches($line, '\{')).Count
        $depth -= ([regex]::Matches($line, '\}')).Count
        $j++
      } while ($j -lt $Lines.Count -and $depth -gt 0)
      $blockText = $block -join "`n"
      if ($blockText -match 'report\.heliontracking\.com') {
        Write-Host 'Disabled inline report.heliontracking.com server block in nginx.conf'
        foreach ($bl in $block) { $out.Add('# disabled by fleet-incident-reporter: ' + $bl) }
      } else {
        foreach ($bl in $block) { $out.Add($bl) }
      }
      $i = $j
      continue
    }
    $out.Add($Lines[$i])
    $i++
  }
  return ,$out.ToArray()
}

$confDir = Split-Path -Parent $ConfPath

# Disable old snippet files that also define report.heliontracking.com
Get-ChildItem -LiteralPath $confDir -Filter *.conf -File | ForEach-Object {
  if ($_.Name -eq 'helion-report-fleet.conf' -or $_.Name -eq 'nginx.conf') { return }
  if ($_.Name -like '*.disabled-by-fleet') { return }
  $text = Get-Content -LiteralPath $_.FullName -Raw
  if ($text -notmatch 'report\.heliontracking\.com') { return }
  $disabled = "$($_.FullName).disabled-by-fleet"
  if (Test-Path -LiteralPath $disabled) { return }
  Rename-Item -LiteralPath $_.FullName -NewName ($_.Name + '.disabled-by-fleet')
  Write-Host "Disabled duplicate snippet: $($_.Name)"
}

$lines = Disable-InlineReportServerBlocks -Lines @(Get-Content -LiteralPath $ConfPath)
$out = New-Object System.Collections.Generic.List[string]

foreach ($line in $lines) {
  if ($line -match 'helion-report-fleet\.conf') { continue }
  if ($line -match 'helion-report-portal|nginx-report-portal|report-portal|helion-report(?!-fleet)') {
    $out.Add('# disabled by fleet-incident-reporter: ' + $line.Trim())
    continue
  }
  if ($line -match 'include\s+.*\.disabled-by-fleet') {
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
