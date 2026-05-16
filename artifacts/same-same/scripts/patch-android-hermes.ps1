# Hermes CLI path with spaces breaks BundleHermesCTask on Windows (cmd splits at space).
$ErrorActionPreference = "Stop"

$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$monorepo = if ($env:SW_MONOREPO) { $env:SW_MONOREPO } else { Join-Path $sameSame "..\.." }
$wrapCmd = Join-Path $monorepo "hermesc.cmd"
$buildGradle = Join-Path $sameSame "android\app\build.gradle"

if (-not (Test-Path $buildGradle)) { exit 0 }

Push-Location $sameSame
try {
  $hermesExe = & node -e @"
const path = require('path');
const rn = require.resolve('react-native/package.json');
const os = process.platform === 'win32' ? 'win64-bin' : process.platform === 'darwin' ? 'osx-bin' : 'linux64-bin';
console.log(path.join(path.dirname(rn), 'sdks', 'hermesc', os, 'hermesc.exe'));
"@
} finally {
  Pop-Location
}

if (-not (Test-Path $hermesExe)) {
  Write-Warning "hermesc.exe not found at $hermesExe"
  exit 0
}

$wrapBody = @"
@echo off
"$hermesExe" %*
"@
Set-Content -Path $wrapCmd -Value $wrapBody -Encoding ASCII

$content = Get-Content $buildGradle -Raw
$escaped = $wrapCmd.Replace('\', '\\')
if ($content -notmatch [regex]::Escape($escaped)) {
  $content = $content -replace '(hermesCommand = new File\(\["node".*?\)\.getAbsolutePath\(\) \+ "/sdks/hermesc/%OS-BIN%/hermesc")', "hermesCommand = `"$escaped`""
  $content = $content -replace 'hermesCommand = "C:\\\\gw-samewave\\\\hermesc\.cmd"', "hermesCommand = `"$escaped`""
  $content = $content -replace 'hermesCommand = "Z:\\\\hermesc\.cmd"', "hermesCommand = `"$escaped`""
  $content = $content -replace 'hermesCommand = "[^"]*hermesc\.cmd"', "hermesCommand = `"$escaped`""
  Set-Content -Path $buildGradle -Value $content -NoNewline
  Write-Host "Patched hermesCommand -> $wrapCmd" -ForegroundColor Yellow
}
