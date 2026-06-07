$ErrorActionPreference = "Continue"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"
$env:NODE_ENV = "production"

$sameSame = "C:\Global-Unity-Match\artifacts\same-same"
& (Join-Path $sameSame "scripts\patch-android-react-root.ps1")
& (Join-Path $sameSame "scripts\patch-android-hermes.ps1")
& (Join-Path $sameSame "scripts\patch-android-package.ps1")

Set-Location (Join-Path $sameSame "android")
$log = "C:\Global-Unity-Match\repair_logs\aab_c_drive_build.log"
.\gradlew.bat bundleRelease 2>&1 | Tee-Object -FilePath $log

if ($LASTEXITCODE -ne 0) {
  Write-Error "Gradle bundleRelease failed with exit $LASTEXITCODE"
}

$aab = Get-ChildItem "app\build\outputs\bundle\release\*.aab" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $aab) { Write-Error "No AAB output found" }
Write-Host "AAB built: $($aab.FullName)" -ForegroundColor Green
