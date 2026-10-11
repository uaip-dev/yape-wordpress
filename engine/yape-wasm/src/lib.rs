// SPDX-License-Identifier: MIT
//! WebAssembly bindings for `yape-engine`.
//!
//! JavaScript usage (from a Web Worker or the main thread):
//!
//! ```js
//! // 1. Load PDFium's Emscripten module (pdfium.js + pdfium.wasm) -> `Module`.
//! // 2. Load this crate's wasm-bindgen output -> `yape` (exports) + `wasm` (instance exports).
//! yape.initialize_pdfium_render(Module, wasm, false); // from pdfium-render
//! yape.init();
//! const info = yape.open(bytes, null);
//! ```
//!
//! The engine lives in a thread-local: wasm32-unknown-unknown is single
//! threaded, and each Web Worker gets its own instance of the module.

use pdfium_render::prelude::Pdfium;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use yape_engine::annots::NewAnnot;
use yape_engine::{DocId, Engine};

thread_local! {
    static ENGINE: RefCell<Option<Engine<'static>>> = const { RefCell::new(None) };
}

fn js_err(e: String) -> JsError {
    JsError::new(&e)
}

fn to_js<T: serde::Serialize>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

fn with<T>(f: impl FnOnce(&mut Engine<'static>) -> Result<T, String>) -> Result<T, JsError> {
    ENGINE.with(|e| match e.borrow_mut().as_mut() {
        Some(engine) => f(engine).map_err(js_err),
        None => Err(JsError::new("yape: call init() first")),
    })
}

/// Binds the engine to PDFium. Call after `initialize_pdfium_render(...)`.
#[wasm_bindgen]
pub fn init() -> Result<(), JsError> {
    ENGINE.with(|e| {
        if e.borrow().is_some() {
            return Ok(());
        }
        let bindings = Pdfium::bind_to_system_library().map_err(|e| JsError::new(&format!("PDFium not bound: {e:?}")))?;
        // One PDFium per module instance, alive for the page's lifetime.
        let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
        *e.borrow_mut() = Some(Engine::new(pdfium));
        Ok(())
    })
}

/// Opens a PDF. Returns `{ id, title, pages: [{width, height}], protected }`.
/// Throws `PASSWORD_REQUIRED` when a (correct) password is needed.
#[wasm_bindgen]
pub fn open(bytes: Vec<u8>, password: Option<String>) -> Result<JsValue, JsError> {
    with(|e| e.open(bytes, password)).and_then(|i| to_js(&i))
}

#[wasm_bindgen]
pub fn close(doc: DocId) -> Result<(), JsError> {
    with(|e| {
        e.close(doc);
        Ok(())
    })
}

#[wasm_bindgen(js_name = pageCount)]
pub fn page_count(doc: DocId) -> Result<u16, JsError> {
    with(|e| e.page_count(doc))
}

#[wasm_bindgen]
pub fn info(doc: DocId) -> Result<JsValue, JsError> {
    with(|e| e.info(doc)).and_then(|i| to_js(&i))
}

/// Renders a page at `scale` px per point. Returns width/height LE u32 header + RGBA.
#[wasm_bindgen]
pub fn render(doc: DocId, page: u16, scale: f32) -> Result<Vec<u8>, JsError> {
    with(|e| e.render(doc, page, scale))
}

/// Plain text of a page.
#[wasm_bindgen(js_name = pageText)]
pub fn page_text(doc: DocId, page: u16) -> Result<String, JsError> {
    with(|e| e.page_text(doc, page)).map(|t| t.to_text())
}

/// Per-character text with boxes: `{ codes: number[], boxes: number[] }`.
#[wasm_bindgen(js_name = pageChars)]
pub fn page_chars(doc: DocId, page: u16) -> Result<JsValue, JsError> {
    with(|e| e.page_text(doc, page)).and_then(|t| to_js(&t))
}

#[wasm_bindgen]
pub fn annotations(doc: DocId, page: u16) -> Result<JsValue, JsError> {
    with(|e| e.annotations(doc, page)).and_then(|a| to_js(&a))
}

/// Adds an annotation, e.g.
/// `{ type: "shape", kind: "rectangle", rect: [l, t, r, b], color: [255, 0, 0], width: 2 }`
/// or `{ type: "markup", kind: "highlight", rects: [[l, t, r, b]], color: [255, 230, 0] }`
/// (displayed page space, points, top-left origin).
#[wasm_bindgen(js_name = addAnnotation)]
pub fn add_annotation(doc: DocId, page: u16, annot: JsValue, author: Option<String>) -> Result<JsValue, JsError> {
    let new: NewAnnot = serde_wasm_bindgen::from_value(annot).map_err(|e| JsError::new(&e.to_string()))?;
    with(|e| e.add_annotation(doc, page, new, author.as_deref().unwrap_or(""))).and_then(|s| to_js(&s))
}

#[wasm_bindgen]
pub fn undo(doc: DocId, redo: bool) -> Result<JsValue, JsError> {
    with(|e| e.undo(doc, redo)).and_then(|s| to_js(&s))
}

/// The document as PDF bytes (encrypted again if it was opened with a password).
#[wasm_bindgen]
pub fn save(doc: DocId) -> Result<Vec<u8>, JsError> {
    with(|e| e.save(doc))
}
