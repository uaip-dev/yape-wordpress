# engine

The PDF engine for the web: PDFium compiled to WebAssembly plus `yape-engine`,
a Rust crate (PDFium via `pdfium-render`, structural edits via `lopdf`) compiled
to WebAssembly with `wasm-bindgen`. Everything runs client-side in a Web Worker;
documents are byte arrays in and byte arrays out.

```
engine/
  Cargo.toml            workspace
  yape-engine/          pure Rust library: no fs, no threads, no async
    src/engine.rs       open (incl. password), page sizes, render, text, annotations, undo, save
    src/annots.rs       annotations (lopdf incremental update + appearance streams)
    src/protect.rs      decrypt on open / AES-256 re-encrypt on save
    src/geom.rs         user space <-> displayed top-left page space
    examples/make_fixtures.rs   writes tests/fixtures/*.pdf
    tests/annots.rs     lopdf-only tests (no PDFium needed)
  yape-wasm/            wasm-bindgen wrapper (JS API below)
  scripts/              fetch-pdfium-wasm.{sh,ps1}, build-wasm.sh
  spike/                browser demo (index.html + worker.js) and node-test.cjs
  tests/fixtures/       generated test PDFs (hello.pdf, hello-protected.pdf / "secret")
  vendor/, pkg/, target/   build output (git-ignored)
```

## Prerequisites

- Rust (stable) with the wasm target: `rustup target add wasm32-unknown-unknown`
- wasm-bindgen CLI matching the crate pin: `cargo install wasm-bindgen-cli --version 0.2.129 --locked`
- Optional: `wasm-opt` (binaryen) on `PATH`; `build-wasm.sh` uses it if present (~15% smaller raw, ~0 after compression)
- Node 18+ for the headless check; any static file server for the browser demo

## Build

```sh
cd engine
scripts/fetch-pdfium-wasm.sh          # or: pwsh scripts/fetch-pdfium-wasm.ps1
                                      # -> vendor/pdfium-wasm/lib/pdfium.{js,wasm} (chromium/8086)
scripts/build-wasm.sh                 # -> pkg/yape_wasm.js + pkg/yape_wasm_bg.wasm
```

## Test

```sh
cargo test -p yape-engine             # native, lopdf-only
node spike/node-test.cjs              # the real wasm artifacts under Node:
                                      # open -> render -> text -> annotate -> undo/redo
                                      # -> save -> reopen, plus the password flow
python -m http.server 8765            # serve engine/ (any static server works)
# open http://localhost:8765/spike/        pick a PDF, add a rectangle, save + reopen, download
# open http://localhost:8765/spike/?auto   runs the whole flow on tests/fixtures/hello.pdf;
#                                          the page title becomes PASS or FAIL
```

Regenerate the fixtures with `cargo run -p yape-engine --example make_fixtures`.

## Loading in JavaScript

The engine needs two wasm modules: PDFium's Emscripten build and yape-wasm.
Both are classic (non-ES-module) scripts, so load them in a classic worker:

```js
self.Module = { locateFile: (p) => PDFIUM_BASE + p, onRuntimeInitialized() { /* ready */ } };
importScripts(PDFIUM_BASE + "pdfium.js", PKG_BASE + "yape_wasm.js");
// ...after onRuntimeInitialized:
const wasm = await wasm_bindgen({ module_or_path: PKG_BASE + "yape_wasm_bg.wasm" });
Module._PDFium_Init ??= Module._FPDF_InitLibrary;  // see "Gotchas"
wasm_bindgen.initialize_pdfium_render(Module, wasm, false);
wasm_bindgen.init();
```

API (all synchronous inside the worker; errors are thrown as `Error(message)`):

| call | returns |
| --- | --- |
| `open(bytes: Uint8Array, password?: string)` | `{ id, title, pages: [{width, height}], protected }`; throws `PASSWORD_REQUIRED` |
| `pageCount(id)` / `info(id)` | number / as `open` |
| `render(id, page, scale)` | `Uint8Array`: width u32 LE, height u32 LE, RGBA pixels (scale = px per point) |
| `pageText(id, page)` / `pageChars(id, page)` | string / `{ codes, boxes }` (boxes: left, top, right, bottom per char) |
| `annotations(id, page)` | `[{ id, kind, rect, color, contents, author, movable }]` |
| `addAnnotation(id, page, annot, author?)` | `{ revision, dirty, canUndo, canRedo }` |
| `undo(id, redo)` | state as above |
| `save(id)` | `Uint8Array` PDF (re-encrypted if it was opened with a password) |
| `close(id)` | |

`annot` is one of (coordinates in points, top-left origin of the displayed page):
`{type:"shape", kind:"rectangle"|"ellipse", rect:[l,t,r,b], color:[r,g,b], width}`,
`{type:"markup", kind:"highlight"|"underline"|"strikeout", rects:[[l,t,r,b],...], color}`,
`{type:"note", at:[x,y], text, color}`, `{type:"ink", strokes:[[[x,y],...]], color, width}`.

## Gotchas

- **PDFium init name.** pdfium-render 0.8 calls `PDFium_Init` (the export of the
  paulocoutinhox/pdfium-lib builds). bblanchon's build only has `FPDF_InitLibrary`,
  so alias it before `initialize_pdfium_render` (one line, above).
- **`wasmTable` must be a global.** pdfium-render patches PDFium's function table
  (for the save callback) and finds it as the global `wasmTable`, which
  `pdfium.js` defines when loaded as a classic script (`importScripts`, or
  `vm.runInThisContext` in Node). An ES-module/bundler import of `pdfium.js`
  would hide it.
- **Memory.** PDFium's heap grows up to 2 GiB; the document bytes are copied
  between yape-wasm's heap and PDFium's heap on every open/save, and every edit
  is a full PDFium save + lopdf parse. Wasm memory never shrinks, so long
  sessions with large files should recycle the worker.
- **No OS facilities.** No file paths (bytes only), no user name (pass `author`),
  clock from `chrono`'s `wasmbind`, random numbers from `getrandom`'s `wasm_js`
  (crypto.getRandomValues). Fonts: PDFium has only its built-in standard fonts,
  no system fonts, so text editing will need fonts shipped/fetched explicitly.

Licensed under the MIT license (see `LICENSE-MIT`). PDFium is BSD-3-Clause /
Apache-2.0 (its licenses ship in `vendor/pdfium-wasm/licenses/`).
