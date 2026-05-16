# One-time: mirror repo to C:\g\w (short paths for Windows native build).
$ErrorActionPreference = "Stop"
$src = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$dest = "C:\g\w"

$parent = Split-Path $dest -Parent
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

Write-Host "Mirroring $src -> $dest (excluding node_modules, build caches)..." -ForegroundColor Cyan
robocopy $src $dest /MIR /XD node_modules android\app\build android\build android\.gradle .expo dist dist-android-test /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy failed with exit $LASTEXITCODE" }

Set-Location $dest
$npmrc = Join-Path $dest ".npmrc"
if (-not (Select-String -Path $npmrc -Pattern "node-linker=hoisted" -Quiet -ErrorAction SilentlyContinue)) {
  Add-Content -Path $npmrc -Value "`nnode-linker=hoisted`n"
  Write-Host "Added node-linker=hoisted to $npmrc" -ForegroundColor Yellow
}

Write-Host "pnpm install at short path (hoisted node_modules)..." -ForegroundColor Cyan
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
pnpm install

Write-Host "Done. Build with:" -ForegroundColor Green
Write-Host "  cd $dest\artifacts\same-same"
Write-Host "  pnpm run build:aab:local"
