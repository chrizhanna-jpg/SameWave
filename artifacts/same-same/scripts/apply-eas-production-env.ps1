# Load eas.json build.production.env into the current process (local AAB parity with EAS).
param(
  [Parameter(Mandatory = $true)]
  [string]$SameSameDir
)

$easPath = Join-Path $SameSameDir "eas.json"
if (-not (Test-Path $easPath)) {
  Write-Host "No eas.json at $easPath — skipping EAS env import." -ForegroundColor DarkYellow
  return
}

$eas = Get-Content $easPath -Raw | ConvertFrom-Json
$envBlock = $eas.build.production.env
if (-not $envBlock) {
  Write-Host "eas.json has no build.production.env — skipping." -ForegroundColor DarkYellow
  return
}

Write-Host "Applying eas.json production env for Metro/Gradle bundle..." -ForegroundColor DarkGray
foreach ($prop in $envBlock.PSObject.Properties) {
  $name = $prop.Name
  $value = [string]$prop.Value
  Set-Item -Path "env:$name" -Value $value
  if ($name -match "KEY|SECRET|PASSWORD|TOKEN") {
    Write-Host "  $name=(set, hidden)" -ForegroundColor DarkGray
  } else {
    Write-Host "  $name=$value" -ForegroundColor DarkGray
  }
}
