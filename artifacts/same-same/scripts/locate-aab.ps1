# Find the most recent SameWave .aab on this PC (common output locations).
$ErrorActionPreference = "SilentlyContinue"

$repoSameSame = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$monorepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$deployRoot = if ($env:SW_BUILD_ROOT) { $env:SW_BUILD_ROOT } else { "C:\w\app" }

$searchRoots = @(
  (Join-Path $repoSameSame "aab"),
  (Join-Path $deployRoot "aab"),
  (Join-Path $repoSameSame "android\app\build\outputs\bundle\release"),
  (Join-Path $deployRoot "android\app\build\outputs\bundle\release"),
  (Join-Path $monorepoRoot "repair_logs")
) | Select-Object -Unique

Write-Host "=== SameWave AAB search ===" -ForegroundColor Cyan
$found = @()
foreach ($root in $searchRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Filter "*.aab" -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { $found += $_ }
}

if ($found.Count -eq 0) {
  Write-Host "No .aab files found. Run: pnpm run build:aab:local" -ForegroundColor Yellow
  Write-Host "Searched:" -ForegroundColor DarkGray
  foreach ($root in $searchRoots) { Write-Host "  $root" -ForegroundColor DarkGray }
  exit 1
}

$found |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 |
  ForEach-Object {
    $sizeMb = $_.Length / 1MB
    Write-Host ("{0:yyyy-MM-dd HH:mm}  {1,8:N2} MB  {2}" -f $_.LastWriteTime, $sizeMb, $_.FullName)
  }

$latest = $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Newest AAB:" -ForegroundColor Green
Write-Host $latest.FullName
