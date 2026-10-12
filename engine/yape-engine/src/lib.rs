// SPDX-License-Identifier: MIT
//! In-memory PDF engine for UAIP Yet Another PDF Editor on the web.
//!
//! Documents live entirely in memory (`Vec<u8>` in, `Vec<u8>` out): no file
//! system, no threads, no async runtime. PDFium (through `pdfium-render`)
//! renders, extracts text and saves; lopdf writes structural changes as
//! incremental updates (annotations, encryption).
//!
//! The caller binds PDFium and hands it to [`Engine::new`]. On native targets
//! that is `Pdfium::bind_to_library(..)`; on `wasm32` it is
//! `Pdfium::bind_to_system_library()` after JavaScript has called
//! `initialize_pdfium_render(pdfiumModule, wasmModule, debug)`.
//!
//! Module layout mirrors the desktop engine so the remaining modules
//! (text/image editing, forms, page operations, redaction, document
//! operations) can be ported one by one.

pub mod annots;
pub mod engine;
pub mod geom;
pub mod protect;

pub use engine::{DocId, DocInfo, DocState, Engine, PageInfo, PageText, RenderedPage, ERR_PASSWORD};
pub use pdfium_render::prelude::Pdfium;

use pdfium_render::prelude::{PdfiumError, PdfiumInternalError};

/// Converts a PDFium error to the message sent to the UI.
pub(crate) fn err(e: PdfiumError) -> String {
    match e {
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => ERR_PASSWORD.to_string(),
        other => format!("{other:?}"),
    }
}
