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

# 2. Core source-of-truth sync: core/domain.mjs -> extension/domain.mjs (byte-for-byte)
$coreDomain = Join-Path $root 'core\domain.mjs'
$copyDomain = Join-Path $root 'extension\domain.mjs'
if (-not (Test-Path $coreDomain)) { throw "missing core/domain.mjs (cross-host source of truth)" }
$coreHash = (Get-FileHash $coreDomain -Algorithm SHA256).Hash
$copyHash = (Get-FileHash $copyDomain -Algorithm SHA256).Hash
if ($coreHash -ne $copyHash) {
    Write-Host 'core/domain.mjs drifted from extension copy, syncing...'
    Copy-Item $coreDomain $copyDomain -Force
    $copyHash = (Get-FileHash $copyDomain -Algorithm SHA256).Hash
    if ($coreHash -ne $copyHash) { throw "core sync failed: extension/domain.mjs still differs after copy" }
}
Write-Host 'core/domain.mjs in sync with extension copy'

# 3. Tests
if (-not $SkipTests) {
    Write-Host '--- running tests ---'
    npm test
    if ($LASTEXITCODE -ne 0) { throw "tests failed, abort release" }
}

# 4. Outputs
$packagesDir = 'C:\12730\packages'
$unpacked = Join-Path $packagesDir "yidian-$version"
$zipPath = Join-Path $packagesDir "yidian-$version.zip"
if (Test-Path $unpacked) { Remove-Item $unpacked -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# 5. Copy extension/ -> unpacked folder (flat content)
Copy-Item 'extension' $unpacked -Recurse

# 6. Zip with flat entries (no wrapper folder), matching Edge Add-ons expectation
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($unpacked, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$zipSize = (Get-Item $zipPath).Length
Write-Host ("DONE: {0} ({1} bytes)" -f $zipPath, $zipSize)
Write-Host ("DONE: {0}" -f $unpacked)
