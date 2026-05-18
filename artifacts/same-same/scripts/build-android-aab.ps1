# Build a Play-ready .aab on Windows (local Gradle; no EAS cloud quota).
$ErrorActionPreference = "Stop"

$JBR = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$SDK = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = $JBR
$env:ANDROID_HOME = $SDK
$env:PATH = "$JBR\bin;$SDK\platform-tools;$env:PATH"

# Canonical Windows deploy tree (short paths). Override only with SW_BUILD_ROOT.
$DeployRoot = if ($env:SW_BUILD_ROOT) {
  $env:SW_BUILD_ROOT
} else {
  "C:\w\app"
}
# Stable folder for upload-ready bundles (not under android\app\build\...).
$AabOutputDir = if ($env:SW_AAB_OUTPUT_DIR) {
  $env:SW_AAB_OUTPUT_DIR
} else {
  Join-Path $DeployRoot "aab"
}

$repoSameSame = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$monorepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))

if (-not (Test-Path (Join-Path $DeployRoot "app.json"))) {
  Write-Error @"
Deploy tree missing at $DeployRoot (need app.json + android/).

One-time setup from the repo:
  pnpm --filter @workspace/same-same deploy C:\w\app --legacy
  cd C:\w\app && pnpm install

Or copy an existing flat deploy tree to $DeployRoot, then re-run build:aab:local.
"@
}

$realAppRoot = $DeployRoot
$sameSame = $DeployRoot

# Always refresh C:\w\app from the git checkout before building.
$syncScript = Join-Path $PSScriptRoot "sync-deploy-tree.ps1"
if ((Test-Path $syncScript) -and (Test-Path (Join-Path $repoSameSame "app.json"))) {
  $repoResolved = [System.IO.Path]::GetFullPath($repoSameSame)
  $deployResolved = [System.IO.Path]::GetFullPath($DeployRoot)
  if ($repoResolved -ne $deployResolved) {
    Write-Host "Syncing sources: $repoResolved -> $deployResolved" -ForegroundColor DarkGray
    $env:SW_DEPLOY_ROOT = $DeployRoot
    & $syncScript
  }
}
$androidDir = Join-Path $sameSame "android"
$credentialsJson = Join-Path $sameSame "credentials.json"
$logDir = Join-Path $sameSame "android\build-logs"

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-NoisyNative {
  param([scriptblock]$Command)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $Command
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $code
}

Write-Host "=== SameWave local Android AAB (Windows) ===" -ForegroundColor Cyan
Write-Host "Deploy root: $DeployRoot" -ForegroundColor DarkGray
Write-Host "AAB output:  $AabOutputDir" -ForegroundColor DarkGray

# Prefer Win32 long paths (helps CMake/ninja under deep pnpm trees).
try {
  $lp = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
  if ($lp.LongPathsEnabled -ne 1) {
    Write-Host "Tip: enable LongPathsEnabled in Windows for deep native builds (requires admin)." -ForegroundColor DarkYellow
  }
} catch { }

if (-not (Test-Path "$JBR\bin\java.exe")) {
  Write-Error "JAVA_HOME invalid. Run: pnpm run setup:android-env"
}
Invoke-NoisyNative { java -version } | Out-Null

if (-not (Test-Path $SDK)) {
  Write-Error "ANDROID_HOME missing. Install SDK via Android Studio."
}

if (-not (Test-Command "pnpm")) {
  Write-Error "pnpm not on PATH."
}

$isFlatDeploy = (Test-Path (Join-Path $realAppRoot "app.json")) -and -not (Test-Path (Join-Path $realAppRoot "artifacts\same-same\package.json"))
Set-Location $realAppRoot
if (-not $isFlatDeploy -and -not (Test-Path "node_modules")) {
  Write-Host "Installing workspace dependencies..."
  pnpm install
} elseif ($isFlatDeploy -and -not (Test-Path "node_modules")) {
  Write-Error "Deploy tree missing node_modules. Run: pnpm --filter @workspace/same-same deploy C:\w\app --legacy"
}

Set-Location $sameSame

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
pnpm exec eas whoami 2>&1 | Out-Null
$easLoggedIn = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap
if (-not $easLoggedIn) {
  if ((Test-Path $credentialsJson) -and (Test-Path (Join-Path $sameSame "credentials\android\keystore.jks"))) {
    Write-Host "EAS CLI not logged in; using local credentials.json + keystore." -ForegroundColor DarkYellow
  } else {
    Write-Error "Not logged in to Expo. Run: pnpm exec eas login"
  }
}

if (-not (Test-Path $credentialsJson)) {
  Write-Host "Signing credentials required. Run: pnpm exec eas credentials -p android" -ForegroundColor Yellow
  exit 1
}

$jks = Join-Path $sameSame "credentials\android\keystore.jks"
if (-not (Test-Path $jks)) {
  Write-Host "Keystore missing ($jks). Re-download from EAS:" -ForegroundColor Red
  Write-Host "  cd `"$sameSame`"" -ForegroundColor Yellow
  Write-Host "  pnpm exec eas credentials -p android" -ForegroundColor Yellow
  exit 1
}
$cred = Get-Content $credentialsJson | ConvertFrom-Json
$ksPass = $cred.android.keystore.keystorePassword
$keytool = Join-Path $JBR "bin\keytool.exe"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $keytool -list -keystore $jks -storepass $ksPass 2>&1 | Out-Null
$ksOk = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap
if (-not $ksOk) {
  Write-Host "Keystore invalid or password mismatch. Re-download from EAS:" -ForegroundColor Red
  Write-Host "  pnpm exec eas credentials -p android" -ForegroundColor Yellow
  exit 1
}
if ((Get-Item $jks).Length -lt 5000) {
  Write-Host "Note: keystore is small but keytool validated it." -ForegroundColor DarkYellow
}

# Prebuild regenerates android/; skip when folder exists (deploy trees cannot run expo install).
if (Test-Path $androidDir) {
  Write-Host "Using existing android/ (skip prebuild)." -ForegroundColor DarkGray
} else {
  Write-Host "Generating native android/ (expo prebuild)..."
  $env:EXPO_NO_DEPENDENCY_VALIDATION = "1"
  $env:CI = "1"
  pnpm exec expo prebuild --platform android --no-install
}

$env:SW_MONOREPO = $realAppRoot
$env:SW_SAME_SAME = $sameSame
# Prefer scripts next to this file (repo) so deploy trees do not need duplicate patches.
$patchDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $patchDir "patch-android-play-abis.ps1"))) {
  $patchDir = Join-Path $sameSame "scripts"
}
& "$patchDir\patch-android-react-root.ps1"
& "$patchDir\patch-android-hermes.ps1"
& "$patchDir\patch-android-signing.ps1"
& "$patchDir\patch-android-play-abis.ps1"
if (-not (Test-Path $androidDir)) {
  Write-Error "prebuild did not create android/"
}

# Staging dir for native (.cxx) outputs — under the deploy tree.
$nativeStage = Join-Path $DeployRoot "native-cache"
if (-not (Test-Path $nativeStage)) { New-Item -ItemType Directory -Path $nativeStage -Force | Out-Null }
$env:REACT_NATIVE_CCACHE_DIR = $nativeStage
$env:CMAKE_BUILD_DIR = $nativeStage

Get-ChildItem -Path (Join-Path $realAppRoot "node_modules") -Directory -Recurse -Filter ".cxx" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Remove-Item -Recurse -Force (Join-Path $androidDir "app\.cxx") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $androidDir "app\build") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $androidDir "build") -ErrorAction SilentlyContinue

$applyEasEnv = Join-Path $patchDir "apply-eas-production-env.ps1"
if (Test-Path $applyEasEnv) {
  & $applyEasEnv -SameSameDir $sameSame
}

$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"
$env:EXPO_USE_METRO_WORKSPACE_ROOT = "0"
$env:NODE_ENV = "production"
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"

$cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue).NumberOfLogicalProcessors
if (-not $cpu) { $cpu = 16 }
$env:NODE_OPTIONS = "--max-old-space-size=8192"
$gradleWorkers = [Math]::Min($cpu, 16)

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$envFile = Join-Path $logDir "env-info.txt"
$gradleLog = Join-Path $logDir "gradle-bundleRelease.log"

@"
---- java ----
"@ | Set-Content $envFile
Invoke-NoisyNative { java -version 2>&1 | Out-File -Append $envFile } | Out-Null
@"
---- gradlew -v ----
"@ | Out-File -Append $envFile
Set-Location $androidDir
Invoke-NoisyNative { .\gradlew.bat -v 2>&1 | Out-File -Append $envFile } | Out-Null
@"
---- gradle-wrapper.properties ----
"@ | Out-File -Append $envFile
Get-Content (Join-Path $androidDir "gradle\wrapper\gradle-wrapper.properties") | Out-File -Append $envFile

Write-Host "Running Gradle bundleRelease (workers=$gradleWorkers)..." -ForegroundColor Cyan
Invoke-NoisyNative { .\gradlew.bat --stop 2>$null | Out-Null } | Out-Null
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
.\gradlew.bat clean bundleRelease --stacktrace --info --parallel --build-cache --max-workers=$gradleWorkers 2>&1 |
  Tee-Object -FilePath $gradleLog
$gradleExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($gradleExit -ne 0) {
  Write-Error "Gradle bundleRelease failed (exit $gradleExit). See $gradleLog"
}

Set-Location $sameSame

$gradleAab = Get-ChildItem -Path (Join-Path $androidDir "app\build\outputs\bundle\release") -Filter "*.aab" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $gradleAab) {
  Write-Error "No .aab found. See $gradleLog"
}

$versionCode = 0
try {
  $appJsonPath = Join-Path $sameSame "app.json"
  $versionCode = [int]((Get-Content $appJsonPath -Raw | ConvertFrom-Json).expo.android.versionCode)
} catch {
  Write-Host "Could not read versionCode from app.json; using timestamp in filename." -ForegroundColor DarkYellow
}

New-Item -ItemType Directory -Path $AabOutputDir -Force | Out-Null
$stamp = if ($versionCode -gt 0) { "vc$versionCode" } else { (Get-Date -Format "yyyyMMdd-HHmm") }
$canonicalName = "SameWave-$stamp.aab"
$canonicalPath = Join-Path $AabOutputDir $canonicalName
$latestPath = Join-Path $AabOutputDir "SameWave-latest.aab"

Copy-Item -Path $gradleAab.FullName -Destination $canonicalPath -Force
Copy-Item -Path $gradleAab.FullName -Destination $latestPath -Force

Write-Host ""
Write-Host "AAB built (Gradle):" -ForegroundColor Green
Write-Host $gradleAab.FullName
Write-Host ""
Write-Host "AAB for Play upload (canonical):" -ForegroundColor Green
Write-Host $canonicalPath
Write-Host $latestPath
Write-Host ("Size: {0:N2} MB" -f ((Get-Item $canonicalPath).Length / 1MB))
Write-Host "Logs: $logDir"
Write-Host 'Upload in Play Console: Closed testing.'
