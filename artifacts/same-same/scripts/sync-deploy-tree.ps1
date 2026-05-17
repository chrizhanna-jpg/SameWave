# Copy SameWave app sources into the short-path deploy tree (C:\w\app) before local AAB builds.
$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot ".."
# Always C:\w\app unless the build script sets SW_DEPLOY_ROOT explicitly.
$dst = if ($env:SW_DEPLOY_ROOT) { $env:SW_DEPLOY_ROOT } else { "C:\w\app" }

if (-not (Test-Path (Join-Path $src "app.json"))) {
  Write-Error "Source not found: $src"
}
if (-not (Test-Path $dst)) {
  Write-Error "Deploy root missing: $dst - run pnpm deploy first."
}

$dirs = @("app", "assets", "utils", "lib", "hooks", "components", "context", "data")
foreach ($d in $dirs) {
  $from = Join-Path $src $d
  if (Test-Path $from) {
    robocopy $from (Join-Path $dst $d) /MIR /XD node_modules .expo /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $d (exit $LASTEXITCODE)" }
    Write-Host "Synced $d/"
  }
}

$files = @("app.json", "app.config.js", "eas.json", "metro.config.js", "babel.config.js", "tsconfig.json")
foreach ($f in $files) {
  Copy-Item (Join-Path $src $f) (Join-Path $dst $f) -Force
  Write-Host "Synced $f"
}

$vc = (Get-Content (Join-Path $dst "app.json") -Raw | ConvertFrom-Json).expo.android.versionCode
$gradle = Join-Path $dst "android\app\build.gradle"
if (Test-Path $gradle) {
  (Get-Content $gradle -Raw) -replace 'versionCode \d+', "versionCode $vc" | Set-Content $gradle -NoNewline
  Write-Host "android/app/build.gradle versionCode -> $vc"
}

$env:SW_SAME_SAME = $dst
& (Join-Path $src "scripts\patch-android-play-abis.ps1")
Write-Host "Deploy tree ready: $dst (versionCode $vc)"
