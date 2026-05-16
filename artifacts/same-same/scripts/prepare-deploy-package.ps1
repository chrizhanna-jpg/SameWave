# Resolve catalog:/workspace: specs in a pnpm deploy tree so `expo prebuild` does not re-install.
$ErrorActionPreference = "Stop"
$pkgPath = if ($args[0]) { $args[0] } else { "C:\w\app\package.json" }
if (-not (Test-Path $pkgPath)) { Write-Error "Missing $pkgPath" }

$replacements = @{
  '"catalog:"' = '' # handled per-key below
}
$json = Get-Content $pkgPath -Raw | ConvertFrom-Json
$catalogMap = @{
  '@tanstack/react-query' = '^5.90.21'
  'react' = '19.1.0'
  'react-dom' = '19.1.0'
  'zod' = '^3.25.76'
}
foreach ($section in @('dependencies', 'devDependencies')) {
  $deps = $json.$section
  if (-not $deps) { continue }
  foreach ($key in @($deps.PSObject.Properties.Name)) {
    $val = $deps.$key
    if ($val -eq 'catalog:') {
      if (-not $catalogMap.ContainsKey($key)) { Write-Error "No catalog mapping for $key" }
      $deps.$key = $catalogMap[$key]
    }
    if ($val -eq 'workspace:*') {
      $deps.$key = 'file:./node_modules/@workspace/api-client-react'
    }
  }
}
function Update-Deps($deps) {
  if (-not $deps) { return }
  foreach ($key in @($deps.PSObject.Properties.Name)) {
    $val = $deps.$key
    if ($val -eq 'catalog:') {
      if (-not $catalogMap.ContainsKey($key)) { Write-Error "No catalog mapping for $key" }
      $deps.$key = $catalogMap[$key]
    }
    if ($val -eq 'workspace:*') {
      $deps.$key = 'file:./node_modules/@workspace/api-client-react'
    }
  }
}

Update-Deps $json.dependencies
Update-Deps $json.devDependencies
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($pkgPath, ($json | ConvertTo-Json -Depth 20), $utf8NoBom)

Get-ChildItem -Path (Split-Path $pkgPath -Parent) -Recurse -Filter "package.json" |
  Where-Object { $_.FullName -match '@workspace' } |
  ForEach-Object {
    $nested = Get-Content $_.FullName -Raw | ConvertFrom-Json
    Update-Deps $nested.dependencies
    Update-Deps $nested.devDependencies
    [System.IO.File]::WriteAllText($_.FullName, ($nested | ConvertTo-Json -Depth 20), $utf8NoBom)
    Write-Host "Patched $($_.FullName)"
  }

Write-Host "Prepared deploy package.json at $pkgPath"
