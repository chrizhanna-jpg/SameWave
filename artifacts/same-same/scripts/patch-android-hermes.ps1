# Hermes CLI path with spaces breaks BundleHermesCTask on Windows (cmd splits at space).
$ErrorActionPreference = "Stop"
$sameSame = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$monorepo = (Resolve-Path (Join-Path $sameSame "..\..")).Path
$junction = "C:\gw-samewave"
$wrapCmd = Join-Path $junction "hermesc.cmd"
$buildGradle = Join-Path $sameSame "android\app\build.gradle"

if (-not (Test-Path $buildGradle)) { exit 0 }

$hermesExe = & node -e @"
const path = require('path');
const rn = require.resolve('react-native/package.json', { paths: ['$($sameSame.Replace('\','\\'))'] });
const os = process.platform === 'win32' ? 'win64-bin' : process.platform === 'darwin' ? 'osx-bin' : 'linux64-bin';
console.log(path.join(path.dirname(rn), 'sdks', 'hermesc', os, 'hermesc.exe'));
"@

if (-not (Test-Path $hermesExe)) {
  Write-Warning "hermesc.exe not found at $hermesExe"
  exit 0
}

if (-not (Test-Path $junction)) {
  cmd /c "mklink /J `"$junction`" `"$monorepo`"" | Out-Null
}

$wrapBody = @"
@echo off
"$hermesExe" %*
"@
Set-Content -Path $wrapCmd -Value $wrapBody -Encoding ASCII

$content = Get-Content $buildGradle -Raw
$escaped = $wrapCmd.Replace('\', '\\')
if ($content -notmatch 'hermesc\.cmd') {
  $content = $content -replace '(hermesCommand = new File\(\["node".*?\)\.getAbsolutePath\(\) \+ "/sdks/hermesc/%OS-BIN%/hermesc")', "hermesCommand = `"$escaped`""
  Set-Content -Path $buildGradle -Value $content -NoNewline
  Write-Host "Patched hermesCommand -> $wrapCmd" -ForegroundColor Yellow
}
