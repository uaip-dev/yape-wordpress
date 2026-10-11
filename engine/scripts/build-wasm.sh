#!/usr/bin/env bash
# Builds yape-wasm for the browser into engine/pkg/ (wasm-bindgen "no-modules"
# output, loadable with importScripts() in a classic Web Worker, or with
# vm.runInThisContext() in Node). Needs: rustup target wasm32-unknown-unknown
# and wasm-bindgen-cli matching the wasm-bindgen crate version (0.2.129).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
cargo build --release -p yape-wasm --target wasm32-unknown-unknown
wasm-bindgen --target no-modules --no-typescript --out-dir pkg target/wasm32-unknown-unknown/release/yape_wasm.wasm
if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue pkg/yape_wasm_bg.wasm -o pkg/yape_wasm_bg.wasm
fi
ls -l pkg
