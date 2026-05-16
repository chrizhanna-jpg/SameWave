# Run once as Administrator. Helps Gradle/CMake under deep pnpm paths.
$ErrorActionPreference = "Stop"
$path = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
Set-ItemProperty -Path $path -Name LongPathsEnabled -Value 1
Write-Host "LongPathsEnabled = 1 (reboot may be required for all tools)" -ForegroundColor Green
