# Build a Play-ready .aab on Windows (local Gradle; no EAS cloud quota).
$ErrorActionPreference = "Stop"

$JBR = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$SDK = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = $JBR
$env:ANDROID_HOME = $SDK
$env:PATH = "$JBR\bin;$SDK\platform-tools;$env:PATH"

# Resolved from this script's location — never hardcode C:\ or D:\ repo paths.
$repoSameSame = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$monorepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$deployCandidate = if ($env:SW_BUILD_ROOT) { $env:SW_BUILD_ROOT } else { "C:\w\app" }
$deployCandidate = [System.IO.Path]::GetFullPath($deployCandidate)

function Test-DeployTree([string]$root) {
  return (Test-Path (Join-Path $root "app.json")) -and (Test-Path (Join-Path $root "android"))
}

function Test-SigningReady([string]$root) {
  $cred = Join-Path $root "credentials.json"
  $jks = Join-Path $root "credentials\android\keystore.jks"
  return (Test-Path $cred) -and (Test-Path $jks)
}

# Prefer C:\w\app when it is a complete deploy tree; otherwise build in this checkout.
$useDeployTree = Test-DeployTree $deployCandidate
if ($useDeployTree) {
  $sameSame = $deployCandidate
  $realAppRoot = $deployCandidate
  $buildMode = "deploy-tree"
} else {
  $sameSame = $repoSameSame
  $realAppRoot = $monorepoRoot
  $buildMode = "repo-checkout"
}

# Upload-ready copies always land beside this git checkout (verified path).
$repoAabDir = [System.IO.Path]::GetFullPath((Join-Path $repoSameSame "aab"))
$AabOutputDir = if ($env:SW_AAB_OUTPUT_DIR) {
  [System.IO.Path]::GetFullPath($env:SW_AAB_OUTPUT_DIR)
} elseif ($buildMode -eq "deploy-tree") {
  [System.IO.Path]::GetFullPath((Join-Path $deployCandidate "aab"))
} else {
  $repoAabDir
}

$androidDir = Join-Path $sameSame "android"
$credentialsJson = Join-Path $sameSame "credentials.json"
$logDir = Join-Path $sameSame "android\build-logs"
$manifestPath = Join-Path $repoAabDir "LAST_BUILD.txt"

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
Write-Host ("Build mode:   {0}" -f $buildMode) -ForegroundColor DarkGray
Write-Host ("Repo checkout: {0}" -f $repoSameSame) -ForegroundColor DarkGray
Write-Host ("Gradle root:   {0}" -f $sameSame) -ForegroundColor DarkGray
Write-Host ("Upload copies: {0}" -f $repoAabDir) -ForegroundColor DarkGray
if ($buildMode -eq "deploy-tree") {
  Write-Host ("Deploy mirror: {0}" -f $AabOutputDir) -ForegroundColor DarkGray
}

# Sync repo sources into deploy tree before building there.
if ($buildMode -eq "deploy-tree") {
  $syncScript = Join-Path $PSScriptRoot "sync-deploy-tree.ps1"
  if ((Test-Path $syncScript) -and (Test-Path (Join-Path $repoSameSame "app.json"))) {
    $repoResolved = [System.IO.Path]::GetFullPath($repoSameSame)
    $deployResolved = [System.IO.Path]::GetFullPath($deployCandidate)
    if ($repoResolved -ne $deployResolved) {
      Write-Host "Syncing sources: $repoResolved -> $deployResolved" -ForegroundColor DarkGray
      $env:SW_DEPLOY_ROOT = $deployCandidate
      & $syncScript
    }
  }
} elseif (-not (Test-Path (Join-Path $repoSameSame "app.json"))) {
  Write-Error "No app.json in repo checkout: $repoSameSame"
}

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
  Write-Error "Deploy tree missing node_modules. Run: pnpm run setup:short-path-build"
}

Set-Location $sameSame

# Credentials may live in deploy tree OR repo checkout.
$credRoot = $sameSame
if (-not (Test-SigningReady $credRoot)) {
  if (Test-SigningReady $repoSameSame) {
    $credRoot = $repoSameSame
    Write-Host "Using signing credentials from repo checkout: $credRoot" -ForegroundColor DarkYellow
  }
}
$credentialsJson = Join-Path $credRoot "credentials.json"
$jks = Join-Path $credRoot "credentials\android\keystore.jks"

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
pnpm exec eas whoami 2>&1 | Out-Null
$easLoggedIn = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap
if (-not $easLoggedIn -and -not (Test-SigningReady $credRoot)) {
  Write-Error "Not logged in to Expo and no local credentials.json + keystore. Run: pnpm exec eas credentials -p android"
}

if (-not (Test-Path $credentialsJson)) {
  Write-Host "Signing credentials required. Run: pnpm exec eas credentials -p android" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $jks)) {
  Write-Host "Keystore missing ($jks). Re-download from EAS:" -ForegroundColor Red
  Write-Host "  cd `"$credRoot`"" -ForegroundColor Yellow
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
$patchDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $patchDir "patch-android-play-abis.ps1"))) {
  $patchDir = Join-Path $sameSame "scripts"
}

# Copy credentials into deploy tree for signing patch when creds only exist in repo.
if ($buildMode -eq "deploy-tree" -and $credRoot -ne $sameSame) {
  Copy-Item $credentialsJson (Join-Path $sameSame "credentials.json") -Force
  $deployJksDir = Join-Path $sameSame "credentials\android"
  New-Item -ItemType Directory -Path $deployJksDir -Force | Out-Null
  Copy-Item $jks (Join-Path $deployJksDir "keystore.jks") -Force
}

& "$patchDir\patch-android-react-root.ps1"
& "$patchDir\patch-android-hermes.ps1"
& "$patchDir\patch-android-signing.ps1"
& "$patchDir\patch-android-play-abis.ps1"
if (-not (Test-Path $androidDir)) {
  Write-Error "prebuild did not create android/"
}

$nativeStage = if ($buildMode -eq "deploy-tree") {
  Join-Path $deployCandidate "native-cache"
} else {
  Join-Path $repoSameSame "native-cache"
}
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

$gradleOutDir = [System.IO.Path]::GetFullPath((Join-Path $androidDir "app\build\outputs\bundle\release"))
$gradleAab = Get-ChildItem -Path $gradleOutDir -Filter "*.aab" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $gradleAab) {
  Write-Error "No .aab under $gradleOutDir — see $gradleLog"
}

$versionCode = 0
$versionName = "unknown"
try {
  $appJsonPath = Join-Path $sameSame "app.json"
  $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
  $versionCode = [int]$appJson.expo.android.versionCode
  $versionName = [string]$appJson.expo.version
} catch {
  Write-Host "Could not read version from app.json — using timestamp in filename." -ForegroundColor DarkYellow
}

New-Item -ItemType Directory -Path $repoAabDir -Force | Out-Null
New-Item -ItemType Directory -Path $AabOutputDir -Force | Out-Null
$stamp = if ($versionCode -gt 0) { "vc$versionCode" } else { (Get-Date -Format "yyyyMMdd-HHmm") }
$canonicalName = "SameWave-$stamp.aab"

$destinations = @(
  @{ Label = "repo upload (canonical)"; Path = (Join-Path $repoAabDir $canonicalName) },
  @{ Label = "repo upload (latest)"; Path = (Join-Path $repoAabDir "SameWave-latest.aab") }
)
if ($AabOutputDir -ne $repoAabDir) {
  $destinations += @(
    @{ Label = "deploy mirror (canonical)"; Path = (Join-Path $AabOutputDir $canonicalName) },
    @{ Label = "deploy mirror (latest)"; Path = (Join-Path $AabOutputDir "SameWave-latest.aab") }
  )
}

foreach ($dest in $destinations) {
  Copy-Item -Path $gradleAab.FullName -Destination $dest.Path -Force
}

Write-Host ""
Write-Host "Gradle raw output:" -ForegroundColor Green
Write-Host $gradleAab.FullName
Write-Host ""
Write-Host "=== Verified upload copies ===" -ForegroundColor Cyan
$verified = @()
$missing = @()
foreach ($dest in $destinations) {
  $full = [System.IO.Path]::GetFullPath($dest.Path)
  if (Test-Path $full) {
    $sizeMb = (Get-Item $full).Length / 1MB
    Write-Host ("  [OK] {0,-26} {1} ({2:N2} MB)" -f $dest.Label, $full, $sizeMb) -ForegroundColor Green
    $verified += $full
  } else {
    Write-Host ("  [MISSING] {0,-26} {1}" -f $dest.Label, $full) -ForegroundColor Red
    $missing += $full
  }
}
if ($missing.Count -gt 0) {
  Write-Error ("AAB copy failed — missing:`n  " + ($missing -join "`n  "))
}

$primaryUpload = [System.IO.Path]::GetFullPath((Join-Path $repoAabDir $canonicalName))
$manifest = @(
  "builtAt=$(Get-Date -Format o)",
  "versionName=$versionName",
  "versionCode=$versionCode",
  "buildMode=$buildMode",
  "repoCheckout=$repoSameSame",
  "gradleRoot=$sameSame",
  "gradleRaw=$($gradleAab.FullName)",
  "primaryUpload=$primaryUpload",
  "latestUpload=$((Join-Path $repoAabDir 'SameWave-latest.aab'))",
  "gradleLog=$gradleLog"
) + ($verified | ForEach-Object { "verified=$_" })
Set-Content -Path $manifestPath -Value ($manifest -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "PRIMARY UPLOAD FILE (open this in Play Console):" -ForegroundColor Green
Write-Host $primaryUpload
Write-Host ""
Write-Host "Manifest written: $manifestPath" -ForegroundColor DarkGray
Write-Host ("Gradle log: {0}" -f $gradleLog) -ForegroundColor DarkGray
Write-Host "Upload in Play Console -> Closed testing."
