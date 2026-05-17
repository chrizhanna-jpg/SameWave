# One-time: ensure the canonical Windows deploy tree exists at C:\w\app.
$ErrorActionPreference = "Stop"
$deployRoot = if ($env:SW_DEPLOY_ROOT) { $env:SW_DEPLOY_ROOT } else { "C:\w\app" }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if (Test-Path (Join-Path $deployRoot "app.json")) {
  Write-Host "Deploy tree already exists: $deployRoot" -ForegroundColor Green
} else {
  Write-Host "Creating deploy tree at $deployRoot ..." -ForegroundColor Cyan
  Set-Location $repoRoot
  pnpm --filter @workspace/same-same deploy $deployRoot --legacy
}

Set-Location $deployRoot
if (-not (Test-Path "node_modules")) {
  Write-Host "pnpm install at $deployRoot ..." -ForegroundColor Cyan
  pnpm install
}

$env:SW_DEPLOY_ROOT = $deployRoot
& (Join-Path $PSScriptRoot "sync-deploy-tree.ps1")

Write-Host "Done. Build AAB with:" -ForegroundColor Green
Write-Host "  cd $repoRoot\artifacts\same-same"
Write-Host "  pnpm run build:aab:local"
Write-Host "Output: $deployRoot\aab\SameWave-latest.aab"
