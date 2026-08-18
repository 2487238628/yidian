# Yidian release script: test -> stage -> zip -> unpacked folder
# Usage: powershell -ExecutionPolicy Bypass -File scripts/release.ps1 [-SkipTests]
param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. Version consistency: manifest.json vs package.json (regex read to avoid encoding issues)
$version = [regex]::Match((Get-Content 'extension\manifest.json' -Raw -Encoding UTF8), '"version"\s*:\s*"([^"]+)"').Groups[1].Value
$pkgVersion = [regex]::Match((Get-Content 'package.json' -Raw -Encoding UTF8), '"version"\s*:\s*"([^"]+)"').Groups[1].Value
if ($version -ne $pkgVersion) {
    throw "version mismatch: manifest=$version package.json=$pkgVersion"
}
if (-not $version) { throw "cannot read version from manifest.json" }
Write-Host "releasing yidian v$version"

# 2. Tests
if (-not $SkipTests) {
    Write-Host '--- running tests ---'
    npm test
    if ($LASTEXITCODE -ne 0) { throw "tests failed, abort release" }
}

# 3. Outputs
$packagesDir = 'C:\12730\packages'
$unpacked = Join-Path $packagesDir "yidian-$version"
$zipPath = Join-Path $packagesDir "yidian-$version.zip"
if (Test-Path $unpacked) { Remove-Item $unpacked -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# 4. Copy extension/ -> unpacked folder (flat content)
Copy-Item 'extension' $unpacked -Recurse

# 5. Zip with flat entries (no wrapper folder), matching Edge Add-ons expectation
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($unpacked, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$zipSize = (Get-Item $zipPath).Length
Write-Host ("DONE: {0} ({1} bytes)" -f $zipPath, $zipSize)
Write-Host ("DONE: {0}" -f $unpacked)
