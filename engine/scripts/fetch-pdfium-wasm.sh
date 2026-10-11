#!/usr/bin/env bash
# Downloads the prebuilt PDFium WebAssembly build (bblanchon/pdfium-binaries,
# BSD/Apache) into engine/vendor/pdfium-wasm/. Usage: fetch-pdfium-wasm.sh [tag]
set -euo pipefail
TAG="${1:-chromium/8086}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/pdfium-wasm"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
URL="https://github.com/bblanchon/pdfium-binaries/releases/download/$TAG/pdfium-wasm.tgz"
echo "Downloading $URL"
curl -fsSL "$URL" -o "$TMP/pdfium-wasm.tgz"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xzf "$TMP/pdfium-wasm.tgz" -C "$DEST"
[ -f "$DEST/VERSION" ] && cat "$DEST/VERSION"
echo "PDFium WASM installed to $DEST"
