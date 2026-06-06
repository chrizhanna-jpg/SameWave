# Build a Play-ready .aab on Windows (no EAS cloud quota).
# Prereqs: Android Studio + SDK, run setup-android-build-env.ps1 once, eas login,
# and download signing credentials (see below).

$ErrorActionPreference = "Stop"

$JBR = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$SDK = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = $JBR
$env:ANDROID_HOME = $SDK
$env:PATH = "$JBR\bin;$SDK\platform-tools;$env:PATH"

$origSameSame = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$origAppRoot = (Resolve-Path (Join-Path $origSameSame "..\..")).Path
$substLetter = $null

function Enter-ShortBuildRoot([string]$root) {
  if ($root -notmatch '[\(\)\s]') { return $root }
  foreach ($letter in @('S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z')) {
    $drive = "${letter}:"
    if (Test-Path $drive) { continue }
    cmd /c "subst $drive `"$root`"" | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Using SUBST $drive -> $root (avoids spaces/parentheses in native builds)" -ForegroundColor Yellow
      $script:substLetter = $letter
      return "$letter\"
    }
  }
  Write-Error "No free drive letter for SUBST. Move the repo to a path without spaces or parentheses."
}

function Exit-ShortBuildRoot {
  if ($script:substLetter) {
    cmd /c "subst $($script:substLetter): /D" 2>$null | Out-Null
    $script:substLetter = $null
  }
}

try {
$appRoot = Enter-ShortBuildRoot $origAppRoot
$sameSame = if ($appRoot -match '^[A-Z]:\\$') {
  Join-Path $appRoot "artifacts\same-same"
} else {
  $origSameSame
}
$scriptRoot = Join-Path $sameSame "scripts"
$credentialsJson = Join-Path $sameSame "credentials.json"

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "=== SameWave local Android AAB (Windows) ===" -ForegroundColor Cyan

if (-not (Test-Path "$JBR\bin\java.exe")) {
  Write-Error "JAVA_HOME invalid. Run: pnpm run setup:android-env"
}
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
java -version 2>&1 | Out-Host
$ErrorActionPreference = $prevEap

if (-not (Test-Path $SDK)) {
  Write-Error "ANDROID_HOME missing. Install SDK via Android Studio."
}

if (-not (Test-Command "pnpm")) {
  Write-Error "pnpm not on PATH."
}

Set-Location $appRoot
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing workspace dependencies..."
  pnpm install
}

Set-Location $sameSame

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
pnpm exec eas whoami *> $null
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) {
  Write-Error "Not logged in to Expo. Run: pnpm exec eas login"
}

if (-not (Test-Path $credentialsJson)) {
  Write-Host ""
  Write-Host "Signing credentials required (same keystore as your Play uploads)." -ForegroundColor Yellow
  Write-Host @"
Run once (interactive):
  cd "$sameSame"
  pnpm exec eas credentials -p android

Choose your production profile, then download credentials to this project.
That creates credentials.json + keystore.jks (gitignored).

Docs: https://docs.expo.dev/app-signing/local-credentials/
"@ -ForegroundColor Yellow
  exit 1
}

$androidDir = Join-Path $sameSame "android"
$skipPrebuild = $env:SKIP_ANDROID_PREBUILD -eq "1"
if ($skipPrebuild -and (Test-Path $androidDir)) {
  Write-Host "Skipping prebuild (SKIP_ANDROID_PREBUILD=1)."
} else {
  Write-Host "Generating native android/ (expo prebuild)..."
  if (Test-Path $androidDir) {
    pnpm exec expo prebuild --platform android --no-install
  } else {
    pnpm exec expo prebuild --platform android --no-install
  }
}
& (Join-Path $scriptRoot "patch-android-react-root.ps1")
& (Join-Path $scriptRoot "patch-android-package.ps1")
& (Join-Path $scriptRoot "patch-android-hermes.ps1")
& (Join-Path $scriptRoot "patch-android-architectures.ps1")
if (-not (Test-Path $androidDir)) {
  Write-Error "prebuild did not create android/"
}

$gradleRoot = $androidDir

# Metro: bundle from artifacts/same-same, not pnpm workspace root.
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"
$env:EXPO_USE_METRO_WORKSPACE_ROOT = "0"
$env:NODE_ENV = "production"
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"

Write-Host "Running Gradle bundleRelease (may take several minutes)..."
Set-Location $gradleRoot
try {
  .\gradlew.bat --stop 2>$null | Out-Null
  .\gradlew.bat bundleRelease
} finally {
  Set-Location $androidDir
}

$aab = Get-ChildItem -Path "app\build\outputs\bundle\release" -Filter "*.aab" -Recurse -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $aab) {
  Write-Error "No .aab found under app/build/outputs/bundle/release"
}

Write-Host ""
Write-Host "AAB built:" -ForegroundColor Green
Write-Host $aab.FullName
Write-Host "Upload this file in Play Console -> Closed testing."
} finally {
  Exit-ShortBuildRoot
}
