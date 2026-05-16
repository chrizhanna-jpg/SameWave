# Re-apply after expo prebuild (prebuild regenerates android/app/build.gradle).
$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$buildGradle = Join-Path $sameSame "android\app\build.gradle"
if (-not (Test-Path $buildGradle)) { exit 0 }

$content = Get-Content $buildGradle -Raw
if ($content -match 'root\s*=\s*file\("\.\./\.\./"\)') { exit 0 }

$needle = "    /* Folders */"
$patch = @"
    /* Folders */
    // Expo app root (artifacts/same-same/package.json), not android/.
    root = file("../../")
"@

if ($content -match [regex]::Escape($needle)) {
  $content = $content -replace [regex]::Escape($needle) + "[\s\S]*?(?=    /\* Variants \*/)", $patch + "`n"
  Set-Content -Path $buildGradle -Value $content -NoNewline
  Write-Host "Patched android/app/build.gradle: react.root = file(../)" -ForegroundColor Yellow
}
