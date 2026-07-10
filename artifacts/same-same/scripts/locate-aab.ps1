# Find SameWave .aab files — reads LAST_BUILD.txt first, then searches the repo.
$ErrorActionPreference = "SilentlyContinue"

$repoSameSame = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$monorepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$manifest = Join-Path $repoSameSame "aab\LAST_BUILD.txt"

Write-Host "=== SameWave AAB locate ===" -ForegroundColor Cyan
Write-Host ("Repo checkout: {0}" -f $repoSameSame) -ForegroundColor DarkGray

if (Test-Path $manifest) {
  Write-Host ""
  Write-Host "Last successful build (from aab/LAST_BUILD.txt):" -ForegroundColor Cyan
  Get-Content $manifest | ForEach-Object {
    if ($_ -match "^primaryUpload=(.+)$") {
      $p = $Matches[1].Trim()
      if (Test-Path $p) {
        $sizeMb = (Get-Item $p).Length / 1MB
        Write-Host ("  [OK] PRIMARY {0} ({1:N2} MB)" -f $p, $sizeMb) -ForegroundColor Green
      } else {
        Write-Host ("  [MISSING] PRIMARY {0}" -f $p) -ForegroundColor Red
      }
    } elseif ($_ -match "^verified=(.+)$") {
      $p = $Matches[1].Trim()
      if (Test-Path $p) {
        $sizeMb = (Get-Item $p).Length / 1MB
        Write-Host ("  [OK] {0} ({1:N2} MB)" -f $p, $sizeMb) -ForegroundColor Green
      }
    } elseif ($_ -match "^gradleRaw=(.+)$") {
      $p = $Matches[1].Trim()
      if (Test-Path $p) {
        $sizeMb = (Get-Item $p).Length / 1MB
        Write-Host ("  [OK] gradle raw {0} ({1:N2} MB)" -f $p, $sizeMb) -ForegroundColor DarkGray
      }
    } elseif ($_ -match "^builtAt=") {
      Write-Host ("  {0}" -f $_) -ForegroundColor DarkGray
    }
  }
  Write-Host ""
}

$searchRoots = @(
  (Join-Path $repoSameSame "aab"),
  (Join-Path $repoSameSame "android\app\build\outputs\bundle\release"),
  (Join-Path $monorepoRoot "repair_logs")
)
$deployCandidate = if ($env:SW_BUILD_ROOT) { $env:SW_BUILD_ROOT } else { "C:\w\app" }
if (Test-Path $deployCandidate) {
  $searchRoots += @(
    (Join-Path $deployCandidate "aab"),
    (Join-Path $deployCandidate "android\app\build\outputs\bundle\release")
  )
}

Write-Host "Searching for .aab files..." -ForegroundColor Cyan
$found = @()
foreach ($root in ($searchRoots | Select-Object -Unique)) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Filter "*.aab" -File -ErrorAction SilentlyContinue |
    ForEach-Object { $found += $_ }
}

if ($found.Count -eq 0) {
  Write-Host "No .aab files found under:" -ForegroundColor Yellow
  foreach ($root in ($searchRoots | Select-Object -Unique)) {
    Write-Host ("  {0}" -f $root) -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "Run a build first: pnpm run build:aab:local" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "All .aab files found (newest first):" -ForegroundColor Cyan
$found |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 |
  ForEach-Object {
    $sizeMb = $_.Length / 1MB
    Write-Host ("{0:yyyy-MM-dd HH:mm}  {1,8:N2} MB  {2}" -f $_.LastWriteTime, $sizeMb, $_.FullName)
  }

$latest = $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Newest .aab on disk:" -ForegroundColor Green
Write-Host $latest.FullName
