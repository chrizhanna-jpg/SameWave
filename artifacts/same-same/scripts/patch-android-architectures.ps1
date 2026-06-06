# Play AAB only needs arm64; skip x86/x86_64 to avoid Windows MAX_PATH failures in native builds.
$ErrorActionPreference = "Stop"

$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$gradleProps = Join-Path $sameSame "android\gradle.properties"

if (-not (Test-Path $gradleProps)) {
  Write-Host "patch-android-architectures: no android/gradle.properties yet (skip)." -ForegroundColor DarkGray
  return
}

$content = Get-Content $gradleProps -Raw
$updated = $content -replace "reactNativeArchitectures=.*", "reactNativeArchitectures=arm64-v8a"
if ($updated -eq $content) {
  Write-Host "reactNativeArchitectures already arm64-v8a" -ForegroundColor DarkGray
} else {
  Set-Content $gradleProps $updated -NoNewline
  Write-Host "Patched gradle.properties: reactNativeArchitectures=arm64-v8a" -ForegroundColor Yellow
}
