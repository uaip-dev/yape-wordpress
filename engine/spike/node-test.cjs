// SPDX-License-Identifier: MIT
// Runs the same artifacts the browser spike uses (PDFium's Emscripten build
// + yape-wasm's wasm-bindgen "no-modules" output) under Node and checks
// open -> render -> text -> annotate -> save -> reopen.
//
// Usage (from engine/): node spike/node-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ENGINE = path.resolve(__dirname, "..");
const PDFIUM_DIR = path.join(ENGINE, "vendor/pdfium-wasm/lib");
const PKG_DIR = path.join(ENGINE, "pkg");
const FIXTURES = path.join(ENGINE, "tests/fixtures");
const OUT = path.join(ENGINE, "tests/out");

// Emscripten's non-modular pdfium.js expects to run as a classic script with
// a global `Module`; give it Node's require/__dirname so it reads pdfium.wasm.
function loadPdfium() {
  return new Promise((resolve, reject) => {
    globalThis.require = require;
    globalThis.__dirname = PDFIUM_DIR;
    globalThis.Module = {
      onRuntimeInitialized() {
        resolve(globalThis.Module);
      },
      onAbort: reject,
    };
    vm.runInThisContext(fs.readFileSync(path.join(PDFIUM_DIR, "pdfium.js"), "utf8"), { filename: "pdfium.js" });
  });
}

function loadYape() {
  const src = fs.readFileSync(path.join(PKG_DIR, "yape_wasm.js"), "utf8");
  vm.runInThisContext(src + "\n;globalThis.wasm_bindgen = wasm_bindgen;", { filename: "yape_wasm.js" });
  const yape = globalThis.wasm_bindgen;
  const wasm = yape.initSync({ module: fs.readFileSync(path.join(PKG_DIR, "yape_wasm_bg.wasm")) });
  return { yape, wasm };
}

function pixel(rendered, x, y) {
  const dv = new DataView(rendered.buffer, rendered.byteOffset);
  const w = dv.getUint32(0, true);
  const i = 8 + (y * w + x) * 4;
  return [rendered[i], rendered[i + 1], rendered[i + 2], rendered[i + 3]];
}

function size(rendered) {
  const dv = new DataView(rendered.buffer, rendered.byteOffset);
  return [dv.getUint32(0, true), dv.getUint32(4, true)];
}

function expectError(fn, message) {
  try {
    fn();
  } catch (e) {
    assert.strictEqual(String(e.message ?? e), message);
    return;
  }
  assert.fail(`expected error ${message}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let t = performance.now();
  const Module = await loadPdfium();
  const tPdfium = performance.now() - t;
  t = performance.now();
  const { yape, wasm } = loadYape();
  // pdfium-render 0.8 initialises via "PDFium_Init" (the paulocoutinhox
  // pdfium-lib export); bblanchon's build exports FPDF_InitLibrary instead.
  Module._PDFium_Init ??= Module._FPDF_InitLibrary;
  assert.ok(yape.initialize_pdfium_render(Module, wasm, false), "initialize_pdfium_render");
  yape.init();
  console.log(`PDFium ready in ${tPdfium.toFixed(0)} ms, yape-wasm in ${(performance.now() - t).toFixed(0)} ms`);

  // ---- plain document ----
  const hello = fs.readFileSync(path.join(FIXTURES, "hello.pdf"));
  const info = yape.open(new Uint8Array(hello), null);
  console.log("open:", JSON.stringify(info));
  assert.strictEqual(info.pages.length, 2);
  assert.strictEqual(yape.pageCount(info.id), 2);
  assert.deepStrictEqual(info.pages[0], { width: 612, height: 792 });
  assert.strictEqual(info.title, "YAPE engine spike");

  t = performance.now();
  let r = yape.render(info.id, 0, 1.0);
  console.log(`render p1 @1x: ${size(r).join("x")} in ${(performance.now() - t).toFixed(0)} ms`);
  assert.deepStrictEqual(size(r), [612, 792]);
  assert.deepStrictEqual(pixel(r, 100, 340).slice(0, 3), [204, 204, 204], "grey box");
  assert.deepStrictEqual(pixel(r, 400, 340).slice(0, 3), [255, 255, 255], "white page");

  const text = yape.pageText(info.id, 0);
  console.log("text p1:", JSON.stringify(text));
  assert.ok(text.includes("Hello from YAPE"));
  assert.ok(yape.pageText(info.id, 1).includes("Second page"));
  const chars = yape.pageChars(info.id, 0);
  assert.strictEqual(chars.boxes.length, chars.codes.length * 4);

  assert.strictEqual(yape.annotations(info.id, 0).length, 0);
  // Red rectangle, 72pt from the top-left corner, 200x100pt.
  let state = yape.addAnnotation(
    info.id,
    0,
    { type: "shape", kind: "rectangle", rect: [300, 72, 500, 172], color: [255, 0, 0], width: 4 },
    "Spike",
  );
  console.log("addAnnotation:", JSON.stringify(state));
  assert.ok(state.dirty && state.canUndo);
  let annots = yape.annotations(info.id, 0);
  console.log("annotations:", JSON.stringify(annots));
  assert.strictEqual(annots.length, 1);
  assert.strictEqual(annots[0].kind, "square");
  assert.strictEqual(annots[0].author, "Spike");
  r = yape.render(info.id, 0, 1.0);
  assert.deepStrictEqual(pixel(r, 300, 120).slice(0, 3), [255, 0, 0], "rectangle edge is red");

  // undo / redo
  yape.undo(info.id, false);
  assert.strictEqual(yape.annotations(info.id, 0).length, 0);
  yape.undo(info.id, true);
  assert.strictEqual(yape.annotations(info.id, 0).length, 1);

  t = performance.now();
  const saved = yape.save(info.id);
  console.log(`save: ${saved.length} bytes (was ${hello.length}) in ${(performance.now() - t).toFixed(0)} ms`);
  fs.writeFileSync(path.join(OUT, "hello-annotated.pdf"), saved);
  yape.close(info.id);

  const re = yape.open(saved, null);
  annots = yape.annotations(re.id, 0);
  assert.strictEqual(annots.length, 1, "annotation persists after save + reopen");
  assert.deepStrictEqual(pixel(yape.render(re.id, 0, 1.0), 300, 120).slice(0, 3), [255, 0, 0]);
  yape.close(re.id);
  console.log("reopen: annotation persisted ✔");

  // ---- password-protected document ----
  const prot = new Uint8Array(fs.readFileSync(path.join(FIXTURES, "hello-protected.pdf")));
  expectError(() => yape.open(prot, null), "PASSWORD_REQUIRED");
  expectError(() => yape.open(prot, "nope"), "PASSWORD_REQUIRED");
  const p = yape.open(prot, "secret");
  assert.ok(p.protected);
  assert.ok(yape.pageText(p.id, 0).includes("Hello from YAPE"));
  yape.addAnnotation(p.id, 0, { type: "markup", kind: "highlight", rects: [[72, 70, 300, 100]], color: [255, 230, 0] }, null);
  const psaved = yape.save(p.id); // re-encrypted (AES-256, key from crypto.getRandomValues)
  fs.writeFileSync(path.join(OUT, "hello-protected-annotated.pdf"), psaved);
  yape.close(p.id);
  expectError(() => yape.open(psaved, null), "PASSWORD_REQUIRED");
  const p2 = yape.open(psaved, "secret");
  annots = yape.annotations(p2.id, 0);
  assert.strictEqual(annots.length, 1);
  assert.strictEqual(annots[0].kind, "highlight");
  yape.close(p2.id);
  console.log("protected: open with password, highlight, save re-encrypted, reopen ✔");

  // ---- a larger render to exercise heap growth ----
  const big = yape.open(saved, null);
  t = performance.now();
  r = yape.render(big.id, 0, 4.0);
  console.log(`render p1 @4x: ${size(r).join("x")} (${(r.length / 1e6).toFixed(1)} MB) in ${(performance.now() - t).toFixed(0)} ms`);
  yape.close(big.id);
  console.log(`PDFium heap: ${(Module.HEAPU8.length / 1048576).toFixed(0)} MiB`);
  console.log("ALL OK");
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
