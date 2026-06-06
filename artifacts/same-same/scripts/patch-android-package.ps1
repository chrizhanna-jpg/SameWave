# Keep android applicationId/namespace aligned with expo.android.package in app.json.
# Re-apply after sync or when prebuild is skipped (stale android/ folder).
$ErrorActionPreference = "Stop"

$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$appJsonPath = Join-Path $sameSame "app.json"
$buildGradle = Join-Path $sameSame "android\app\build.gradle"

if (-not (Test-Path $appJsonPath)) {
  Write-Error "app.json not found: $appJsonPath"
}
if (-not (Test-Path $buildGradle)) {
  Write-Host "patch-android-package: no android/app/build.gradle yet (skip)." -ForegroundColor DarkGray
  return
}

$pkg = (Get-Content $appJsonPath -Raw | ConvertFrom-Json).expo.android.package
if (-not $pkg) {
  Write-Error "expo.android.package missing in app.json"
}

$content = Get-Content $buildGradle -Raw
$updated = $content `
  -replace "namespace\s+'[^']+'", "namespace '$pkg'" `
  -replace 'namespace\s+"[^"]+"', "namespace `"$pkg`"" `
  -replace "applicationId\s+'[^']+'", "applicationId '$pkg'" `
  -replace 'applicationId\s+"[^"]+"', "applicationId `"$pkg`""

if ($updated -eq $content) {
  if ($content -match [regex]::Escape($pkg)) {
    Write-Host "android package already $pkg" -ForegroundColor DarkGray
  } else {
    Write-Warning "patch-android-package: could not find namespace/applicationId to replace in build.gradle"
  }
} else {
  Set-Content $buildGradle $updated -NoNewline
  Write-Host "Patched android/app/build.gradle: package -> $pkg" -ForegroundColor Yellow
}

# MainActivity / manifest package paths (Expo prebuild usually matches; fix legacy samesame paths).
$javaRoot = Join-Path $sameSame "android\app\src\main\java"
if (Test-Path $javaRoot) {
  Get-ChildItem $javaRoot -Recurse -Filter "*.kt" -ErrorAction SilentlyContinue | ForEach-Object {
    $kt = Get-Content $_.FullName -Raw
    if ($kt -match "package (app\.echo\.(?:samesame|samewave)|echo\.samewaveripple\.app)") {
      $kt2 = $kt -replace "package (app\.echo\.(?:samesame|samewave)|echo\.samewaveripple\.app)", "package $pkg"
      Set-Content $_.FullName $kt2 -NoNewline
      Write-Host "Patched $($_.FullName): package declaration" -ForegroundColor DarkYellow
    }
  }
}
