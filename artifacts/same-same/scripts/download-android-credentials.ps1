# ONE interactive step you must run locally (EAS cannot download keystore non-interactively).
Write-Host @"

=== Download Android signing (one time, ~1 minute) ===

In the menu that opens:
  1. Build profile: production
  2. Credentials.json → Upload/Download credentials...
  3. Download credentials from EAS to credentials.json

Then run:  pnpm run build:aab:local

"@ -ForegroundColor Cyan

Set-Location (Split-Path $PSScriptRoot -Parent)
pnpm exec eas credentials -p android
