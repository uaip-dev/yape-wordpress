// SPDX-License-Identifier: MIT
//! Open documents and the operations on them.
//!
//! Single-threaded by design: the engine is owned by whoever drives it (a Web
//! Worker in the browser), so there is no worker thread or channel as in the
//! desktop app. Every change replaces the document bytes and keeps the
//! previous bytes for undo.

use crate::annots::{self, AnnotInfo, NewAnnot};
use crate::err;
use crate::geom::Geom;
use crate::protect::{self, Protection};
use pdfium_render::prelude::*;
use serde::Serialize;
use std::collections::HashMap;

pub type DocId = u32;

/// Error code the UI recognises to show a password prompt.
pub const ERR_PASSWORD: &str = "PASSWORD_REQUIRED";

/// Undo snapshots kept per document (each one is a full copy of the PDF).
const MAX_UNDO: usize = 20;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    /// Page size in PDF points (1/72 inch), after page rotation.
    pub width: f32,
    pub height: f32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocInfo {
    pub id: DocId,
    pub title: Option<String>,
    pub pages: Vec<PageInfo>,
    /// The file was password protected (it is kept decrypted while open and
    /// encrypted again by `save`).
    pub protected: bool,
}

/// Raw RGBA bitmap: 8-byte header (width u32 LE, height u32 LE) + pixels.
pub type RenderedPage = Vec<u8>;

/// Text of one page, one entry per PDFium character.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageText {
    /// Unicode code points. Generated characters (spaces, line breaks) are included.
    pub codes: Vec<u32>,
    /// Four numbers per character: left, top, right, bottom. All zero if unknown.
    pub boxes: Vec<f32>,
}

impl PageText {
    pub fn to_text(&self) -> String {
        self.codes.iter().filter_map(|&c| char::from_u32(c)).collect()
    }
}

/// Result of a change, so the UI can refresh its controls.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocState {
    pub revision: u32,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

struct OpenDoc<'a> {
    doc: PdfDocument<'a>,
    password: Option<String>,
    /// Encryption to apply when saving (the open document is kept decrypted).
    protection: Option<Protection>,
    undo: Vec<Vec<u8>>,
    redo: Vec<Vec<u8>>,
    dirty: bool,
    revision: u32,
}

impl<'a> OpenDoc<'a> {
    fn bytes(&self) -> Result<Vec<u8>, String> {
        self.doc.save_to_bytes().map_err(err)
    }

    fn state(&self) -> DocState {
        DocState {
            revision: self.revision,
            dirty: self.dirty,
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
        }
    }

    fn push_undo(&mut self, bytes: Vec<u8>) {
        self.undo.push(bytes);
        if self.undo.len() > MAX_UNDO {
            self.undo.remove(0);
        }
        self.redo.clear();
    }

    /// Replaces the document with one loaded from `bytes`.
    fn reload(&mut self, pdfium: &'a Pdfium, bytes: Vec<u8>) -> Result<(), String> {
        let doc = pdfium
            .load_pdf_from_byte_vec(bytes.clone(), None)
            .or_else(|_| pdfium.load_pdf_from_byte_vec(bytes, self.password.as_deref()))
            .map_err(err)?;
        self.doc = doc;
        self.dirty = true;
        self.revision += 1;
        Ok(())
    }
}

/// All open documents, bound to one PDFium instance.
pub struct Engine<'a> {
    pdfium: &'a Pdfium,
    open: HashMap<DocId, OpenDoc<'a>>,
    next_id: DocId,
}

impl<'a> Engine<'a> {
    pub fn new(pdfium: &'a Pdfium) -> Self {
        Engine { pdfium, open: HashMap::new(), next_id: 1 }
    }

    fn get(&self, id: DocId) -> Result<&OpenDoc<'a>, String> {
        self.open.get(&id).ok_or_else(|| format!("No open document with id {id}"))
    }

    fn get_mut(&mut self, id: DocId) -> Result<&mut OpenDoc<'a>, String> {
        self.open.get_mut(&id).ok_or_else(|| format!("No open document with id {id}"))
    }

    /// Opens a document from bytes. Fails with [`ERR_PASSWORD`] when a
    /// password is needed and none (or a wrong one) was given.
    pub fn open(&mut self, bytes: Vec<u8>, password: Option<String>) -> Result<DocInfo, String> {
        let mut doc = self.pdfium.load_pdf_from_byte_vec(bytes.clone(), password.as_deref()).map_err(err)?;
        // Password-protected: work on a decrypted copy so every feature works,
        // and encrypt again on save. If lopdf can't decrypt it, keep PDFium's view.
        let mut protection = None;
        let encrypted = !matches!(
            doc.permissions().security_handler_revision(),
            Ok(PdfSecurityHandlerRevision::Unprotected)
        );
        if encrypted {
            if let Ok((plain, p)) = protect::decrypt(&bytes, password.as_deref().unwrap_or("")) {
                if let Ok(d) = self.pdfium.load_pdf_from_byte_vec(plain, None) {
                    doc = d;
                    protection = Some(p);
                }
            }
        }
        let id = self.next_id;
        self.next_id += 1;
        let info = doc_info(id, &doc, encrypted);
        self.open.insert(
            id,
            OpenDoc { doc, password, protection, undo: Vec::new(), redo: Vec::new(), dirty: false, revision: 0 },
        );
        Ok(info)
    }

    pub fn close(&mut self, id: DocId) {
        self.open.remove(&id);
    }

    pub fn info(&self, id: DocId) -> Result<DocInfo, String> {
        let d = self.get(id)?;
        Ok(doc_info(id, &d.doc, d.protection.is_some()))
    }

    pub fn page_count(&self, id: DocId) -> Result<u16, String> {
        Ok(self.get(id)?.doc.pages().len())
    }

    pub fn state(&self, id: DocId) -> Result<DocState, String> {
        Ok(self.get(id)?.state())
    }

    /// Renders a page at `scale` pixels per PDF point (1.0 = 72 dpi).
    pub fn render(&self, id: DocId, page: u16, scale: f32) -> Result<RenderedPage, String> {
        let d = self.get(id)?;
        let page = d.doc.pages().get(page).map_err(err)?;
        let width = (page.width().value * scale).round().clamp(16.0, 8192.0) as i32;
        let config = PdfRenderConfig::new()
            .set_target_width(width)
            .render_form_data(true)
            .render_annotations(true);
        let bitmap = page.render_with_config(&config).map_err(err)?;
        let (w, h) = (bitmap.width() as u32, bitmap.height() as u32);
        let rgba = bitmap.as_rgba_bytes();
        let mut out = Vec::with_capacity(8 + rgba.len());
        out.extend_from_slice(&w.to_le_bytes());
        out.extend_from_slice(&h.to_le_bytes());
        out.extend_from_slice(&rgba);
        Ok(out)
    }

    pub fn page_text(&self, id: DocId, page: u16) -> Result<PageText, String> {
        let d = self.get(id)?;
        let page = d.doc.pages().get(page).map_err(err)?;
        extract_text(&page)
    }

    pub fn annotations(&self, id: DocId, page: u16) -> Result<Vec<AnnotInfo>, String> {
        let d = self.get(id)?;
        let page = d.doc.pages().get(page).map_err(err)?;
        Ok(annots::list(&page, &Geom::of(&page)))
    }

    /// Adds an annotation (lopdf incremental update, with appearance stream).
    pub fn add_annotation(&mut self, id: DocId, page: u16, new: NewAnnot, author: &str) -> Result<DocState, String> {
        let pdfium = self.pdfium;
        let d = self.get_mut(id)?;
        let geom = Geom::of(&d.doc.pages().get(page).map_err(err)?);
        let current = d.bytes()?;
        let updated = annots::create(&current, page, &geom, new, author)?;
        d.push_undo(current);
        d.reload(pdfium, updated)?;
        Ok(d.state())
    }

    /// Steps back (or forward, with `redo`) through the change history.
    pub fn undo(&mut self, id: DocId, redo: bool) -> Result<DocState, String> {
        let pdfium = self.pdfium;
        let d = self.get_mut(id)?;
        let Some(bytes) = (if redo { d.redo.pop() } else { d.undo.pop() }) else {
            return Ok(d.state());
        };
        let current = d.bytes()?;
        if redo {
            d.undo.push(current);
        } else {
            d.redo.push(current);
        }
        d.reload(pdfium, bytes)?;
        Ok(d.state())
    }

    /// The document as PDF bytes, encrypted again if it was opened with a password.
    pub fn save(&mut self, id: DocId) -> Result<Vec<u8>, String> {
        let d = self.get_mut(id)?;
        let mut bytes = d.bytes()?;
        if let Some(p) = &d.protection {
            bytes = protect::encrypt(&bytes, p)?;
        }
        d.dirty = false;
        Ok(bytes)
    }
}

fn doc_info(id: DocId, doc: &PdfDocument, protected: bool) -> DocInfo {
    let title = doc
        .metadata()
        .get(PdfDocumentMetadataTagType::Title)
        .map(|t| t.value().trim().to_string())
        .filter(|t| !t.is_empty());
    let pages = doc
        .pages()
        .iter()
        .map(|p| PageInfo { width: p.width().value, height: p.height().value })
        .collect();
    DocInfo { id, title, pages, protected }
}

fn extract_text(page: &PdfPage) -> Result<PageText, String> {
    let geom = Geom::of(page);
    let text = page.text().map_err(err)?;
    let chars = text.chars();
    let mut codes = Vec::with_capacity(chars.len());
    let mut boxes = Vec::with_capacity(chars.len() * 4);
    for ch in chars.iter() {
        codes.push(ch.unicode_value());
        match ch.loose_bounds() {
            Ok(r) if r.width().value > 0.0 || r.height().value > 0.0 => boxes.extend_from_slice(&geom.rect(&r)),
            _ => boxes.extend_from_slice(&[0.0; 4]),
        }
    }
    Ok(PageText { codes, boxes })
}
