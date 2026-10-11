# Downloads the prebuilt PDFium WebAssembly build (bblanchon/pdfium-binaries,
# BSD/Apache) into engine/vendor/pdfium-wasm/. Usage: fetch-pdfium-wasm.ps1 [-Tag chromium/8086]
param([string]$Tag = "chromium/8086")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root "vendor/pdfium-wasm"
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("pdfium-wasm-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $Tmp | Out-Null
try {
    $Url = "https://github.com/bblanchon/pdfium-binaries/releases/download/$Tag/pdfium-wasm.tgz"
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $Tmp "pdfium-wasm.tgz")
    if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
    New-Item -ItemType Directory -Force $Dest | Out-Null
    tar -xzf (Join-Path $Tmp "pdfium-wasm.tgz") -C $Dest
    if (Test-Path (Join-Path $Dest "VERSION")) { Get-Content (Join-Path $Dest "VERSION") }
    Write-Host "PDFium WASM installed to $Dest"
} finally {
    Remove-Item -Recurse -Force $Tmp
}
