# Wire EAS credentials.json into release signing (Play upload key). Idempotent.
$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$credsFile = Join-Path $sameSame "credentials.json"
$buildGradle = Join-Path $sameSame "android\app\build.gradle"

if (-not (Test-Path $credsFile)) { exit 0 }
if (-not (Test-Path $buildGradle)) { exit 0 }

$creds = Get-Content $credsFile -Raw | ConvertFrom-Json
$ks = $creds.android.keystore
if (-not $ks) { exit 0 }

$storeRel = ($ks.keystorePath -replace '\\', '/').TrimStart('/')
$content = Get-Content $buildGradle -Raw

# Remove duplicate release signing blocks from repeated patch runs.
$content = [regex]::Replace(
  $content,
  '(?ms)\s*release\s*\{\s*storeFile file\("\.\./\.\./[^"]+"\)\s*storePassword "[^"]*"\s*keyAlias "[^"]*"\s*keyPassword "[^"]*"\s*\}',
  ''
)

$releaseBlock = @"

        release {
            storeFile file("../../$storeRel")
            storePassword "$($ks.keystorePassword)"
            keyAlias "$($ks.keyAlias)"
            keyPassword "$($ks.keyPassword)"
        }
"@

# Do not use signingConfigs\{.*?release — that can match buildTypes.release.
if ($content -notmatch '(?ms)signingConfigs\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?storeFile') {
  $content = $content -replace '(?ms)(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})', "`$1$releaseBlock"
}

$content = $content -replace '(?ms)(buildTypes\s*\{.*?release\s*\{.*?)signingConfig signingConfigs\.debug', '$1signingConfig signingConfigs.release'

Set-Content -Path $buildGradle -Value $content -NoNewline
Write-Host "Patched release signing from credentials.json" -ForegroundColor Yellow
