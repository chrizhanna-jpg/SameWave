# Print upload-keystore SHA-1/256 and remind to add Play App signing certs to Google Cloud.
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sameSame = Split-Path -Parent $scriptRoot
$credentialsJson = Join-Path $sameSame "credentials.json"
$jks = Join-Path $sameSame "credentials\android\keystore.jks"

$JBR = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$keytool = Join-Path $JBR "bin\keytool.exe"
if (-not (Test-Path $keytool)) {
  Write-Error "keytool not found. Set JAVA_HOME or install Android Studio JBR."
}

Write-Host "=== SameWave Android OAuth fingerprints ===" -ForegroundColor Cyan
Write-Host "Package: echo.samewaveripple.app"
Write-Host ""

if ((Test-Path $credentialsJson) -and (Test-Path $jks)) {
  $cred = Get-Content $credentialsJson | ConvertFrom-Json
  $ksPass = $cred.android.keystore.keystorePassword
  Write-Host "Upload keystore (local/EAS upload key):" -ForegroundColor Yellow
  & $keytool -list -v -keystore $jks -storepass $ksPass -alias upload 2>$null
  if ($LASTEXITCODE -ne 0) {
    & $keytool -list -v -keystore $jks -storepass $ksPass
  }
  Write-Host ""
} else {
  Write-Host "No credentials.json + keystore at $sameSame" -ForegroundColor DarkYellow
  Write-Host "Run: pnpm exec eas credentials -p android" -ForegroundColor Yellow
  Write-Host ""
}

Write-Host "Play closed testing uses Google Play App Signing." -ForegroundColor Green
Write-Host "You MUST also add SHA-1 and SHA-256 from:" -ForegroundColor Green
Write-Host "  Play Console -> Your app -> Setup -> App signing -> App signing key certificate"
Write-Host ""
Write-Host "Google Cloud -> Credentials -> OAuth client ID -> Android:" -ForegroundColor Cyan
Write-Host "  Package name: echo.samewaveripple.app"
Write-Host "  SHA-1: (from Play App signing key certificate)"
Write-Host ""
Write-Host "Clerk Dashboard -> Google: Web client ID + secret; redirect URIs from Clerk." -ForegroundColor Cyan
Write-Host "Clerk Dashboard -> Native applications -> Allowlist: echo.samewaveripple.app://callback" -ForegroundColor Cyan
