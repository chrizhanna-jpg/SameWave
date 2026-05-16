# Replace Groovy node.execute() paths with pinned file() paths (one drive root, no C:/Z: mix).
$ErrorActionPreference = "Stop"
$sameSame = if ($env:SW_SAME_SAME) { $env:SW_SAME_SAME } else { Join-Path $PSScriptRoot ".." }
$androidDir = Join-Path $sameSame "android"
$buildGradle = Join-Path $sameSame "android\app\build.gradle"
if (-not (Test-Path $buildGradle)) { exit 0 }

function Get-NodePathFromAppRoot([string]$expr) {
  Push-Location $sameSame
  try {
    return (node -e $expr).Trim()
  } finally {
    Pop-Location
  }
}

$rootForNode = $sameSame -replace '\\', '/'
Push-Location $androidDir
try {
  $entry = (node -e "console.log(require('expo/scripts/resolveAppEntry')(process.argv[1], process.argv[2], process.argv[3]))" $rootForNode android absolute).Trim()
} finally {
  Pop-Location
}

$rnDir = Get-NodePathFromAppRoot "console.log(require('path').dirname(require.resolve('react-native/package.json')))"
$cli = Get-NodePathFromAppRoot "console.log(require.resolve('@expo/cli/build/bin/cli'))"
$codegen = Get-NodePathFromAppRoot "console.log(require('path').dirname(require.resolve('@react-native/codegen/package.json')))"

function GroovyFile([string]$path) {
  $p = $path -replace '\\', '/'
  "file(`"$p`")"
}

$content = Get-Content $buildGradle -Raw
$content = $content -replace 'def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)', "def projectRoot = file(`"../../`").absolutePath"
$content = $content -replace 'entryFile = file\(\["node".*?\)\.text\.trim\(\)\)', "entryFile = $(GroovyFile $entry)"
$content = $content -replace 'reactNativeDir = new File\(\["node".*?\)\.getAbsoluteFile\(\)', "reactNativeDir = $(GroovyFile $rnDir)"
$content = $content -replace 'codegenDir = new File\(\["node".*?\)\.getAbsoluteFile\(\)', "codegenDir = $(GroovyFile $codegen)"
$content = $content -replace 'cliFile = new File\(\["node".*?\)\.text\.trim\(\)\)', "cliFile = $(GroovyFile $cli)"

Set-Content -Path $buildGradle -Value $content -NoNewline
Write-Host "Patched bundle paths (entry, RN, cli, codegen)" -ForegroundColor Yellow
