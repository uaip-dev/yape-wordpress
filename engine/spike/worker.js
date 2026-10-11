// SPDX-License-Identifier: MIT
// Classic Web Worker hosting PDFium (Emscripten) + yape-wasm (wasm-bindgen
// "no-modules"). The page talks to it with {id, cmd, args} messages and gets
// {id, ok, result | error} back. Paths assume the server root is engine/.
"use strict";

const PDFIUM_BASE = "../vendor/pdfium-wasm/lib/";
const PKG_BASE = "../pkg/";

const ready = (async () => {
  const t0 = performance.now();
  const pdfiumReady = new Promise((resolve, reject) => {
    self.Module = {
      locateFile: (p) => PDFIUM_BASE + p,
      onRuntimeInitialized: () => resolve(self.Module),
      onAbort: reject,
    };
  });
  importScripts(PDFIUM_BASE + "pdfium.js", PKG_BASE + "yape_wasm.js");
  const Module = await pdfiumReady;
  const t1 = performance.now();
  const wasm = await wasm_bindgen({ module_or_path: PKG_BASE + "yape_wasm_bg.wasm" });
  // pdfium-render 0.8 initialises via "PDFium_Init" (the paulocoutinhox
  // pdfium-lib export); bblanchon's build exports FPDF_InitLibrary instead.
  Module._PDFium_Init ??= Module._FPDF_InitLibrary;
  if (!wasm_bindgen.initialize_pdfium_render(Module, wasm, false)) throw new Error("initialize_pdfium_render failed");
  wasm_bindgen.init();
  return { pdfiumMs: Math.round(t1 - t0), yapeMs: Math.round(performance.now() - t1) };
})();

const commands = {
  ready: () => ready,
  open: (bytes, password) => wasm_bindgen.open(new Uint8Array(bytes), password ?? null),
  close: (doc) => wasm_bindgen.close(doc),
  render: (doc, page, scale) => {
    const r = wasm_bindgen.render(doc, page, scale);
    const dv = new DataView(r.buffer, r.byteOffset);
    const width = dv.getUint32(0, true);
    const height = dv.getUint32(4, true);
    const pixels = new Uint8ClampedArray(r.buffer, r.byteOffset + 8, width * height * 4);
    return { width, height, pixels };
  },
  pageText: (doc, page) => wasm_bindgen.pageText(doc, page),
  annotations: (doc, page) => wasm_bindgen.annotations(doc, page),
  addAnnotation: (doc, page, annot, author) => wasm_bindgen.addAnnotation(doc, page, annot, author ?? null),
  undo: (doc, redo) => wasm_bindgen.undo(doc, !!redo),
  save: (doc) => wasm_bindgen.save(doc),
};

self.onmessage = async ({ data: { id, cmd, args } }) => {
  try {
    await ready;
    const result = await commands[cmd](...(args || []));
    const transfer = [];
    if (result instanceof Uint8Array) transfer.push(result.buffer);
    else if (result && result.pixels) transfer.push(result.pixels.buffer);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) });
  }
};
