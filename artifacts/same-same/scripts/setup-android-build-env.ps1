# One-time: set User environment variables for Android release builds on Windows.
# Re-open PowerShell / Android Studio after running.

$JBR = "C:\Program Files\Android\Android Studio\jbr"
$SDK = "$env:LOCALAPPDATA\Android\Sdk"

if (-not (Test-Path "$JBR\bin\java.exe")) {
  Write-Error "Android Studio JBR not found at $JBR. Install Android Studio first."
}
if (-not (Test-Path $SDK)) {
  Write-Error "Android SDK not found at $SDK. Open Android Studio → SDK Manager."
}

[Environment]::SetEnvironmentVariable("JAVA_HOME", $JBR, "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $SDK, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $SDK, "User")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$add = @(
  "$JBR\bin",
  "$SDK\platform-tools",
  "$SDK\cmdline-tools\latest\bin"
)
$parts = $userPath -split ";" | Where-Object { $_ }
foreach ($p in $add) {
  if ($parts -notcontains $p) { $parts += $p }
}
[Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")

Write-Host "Set JAVA_HOME=$JBR"
Write-Host "Set ANDROID_HOME=$SDK"
Write-Host "Done. Close and reopen terminals, then run: pnpm run build:aab:local"
