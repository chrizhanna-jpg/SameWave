# Play release bundles must include all React Native ABIs (not arm64-only).
# arm64-only drops ~5k+ devices (armeabi-v7a 32-bit phones, x86 emulators/tablets).
$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$gradleProps = Join-Path $sameSame "android\gradle.properties"
if (-not (Test-Path $gradleProps)) { exit 0 }

$allAbis = "armeabi-v7a,arm64-v8a,x86,x86_64"
$content = Get-Content $gradleProps -Raw

if ($content -match "(?m)^reactNativeArchitectures=.*$") {
  $content = [regex]::Replace(
    $content,
    "(?m)^reactNativeArchitectures=.*$",
    "reactNativeArchitectures=$allAbis"
  )
} else {
  $content += "`nreactNativeArchitectures=$allAbis`n"
}

Set-Content -Path $gradleProps -Value $content -NoNewline
Write-Host "Patched gradle.properties: reactNativeArchitectures=$allAbis (Play release)" -ForegroundColor Yellow
