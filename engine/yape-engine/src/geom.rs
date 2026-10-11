//! Page geometry: maps PDF user space to top-left, rotated page space.
//!
//! All coordinates handed to the UI are in PDF points with a top-left origin,
//! in the page's displayed orientation (after /Rotate and the crop box).

use pdfium_render::prelude::*;

/// Maps PDF user space to top-left, rotated page space.
#[derive(Clone, Copy)]
pub struct Geom {
    left: f32,
    top: f32,
    w: f32,
    h: f32,
    rot: u8, // quarter turns clockwise
}

impl Geom {
    /// Geometry of an unrotated page whose crop box is `[left, bottom, right, top]`.
    pub fn from_box(r: [f32; 4]) -> Self {
        Geom { left: r[0], top: r[3], w: r[2] - r[0], h: r[3] - r[1], rot: 0 }
    }

    pub fn of(page: &PdfPage) -> Self {
        let rect = page
            .boundaries()
            .crop()
            .or_else(|_| page.boundaries().media())
            .map(|b| b.bounds)
            .ok();
        let rot = match page.rotation() {
            Ok(PdfPageRenderRotation::Degrees90) => 1,
            Ok(PdfPageRenderRotation::Degrees180) => 2,
            Ok(PdfPageRenderRotation::Degrees270) => 3,
            _ => 0,
        };
        match rect {
            Some(r) => Geom {
                left: r.left().value,
                top: r.top().value,
                w: r.width().value,
                h: r.height().value,
                rot,
            },
            None => {
                let (w, h) = (page.width().value, page.height().value);
                let (w, h) = if rot % 2 == 1 { (h, w) } else { (w, h) };
                Geom { left: 0.0, top: h, w, h, rot }
            }
        }
    }

    pub fn point(&self, x: f32, y: f32) -> (f32, f32) {
        let (u, v) = (x - self.left, self.top - y);
        match self.rot {
            1 => (self.h - v, u),
            2 => (self.w - u, self.h - v),
            3 => (v, self.w - u),
            _ => (u, v),
        }
    }

    /// Inverse of `point`: displayed page space to user space.
    pub fn unpoint(&self, px: f32, py: f32) -> (f32, f32) {
        let (u, v) = match self.rot {
            1 => (py, self.h - px),
            2 => (self.w - px, self.h - py),
            3 => (self.w - py, px),
            _ => (px, py),
        };
        (u + self.left, self.top - v)
    }

    /// Displayed page width and height.
    pub fn display_size(&self) -> (f32, f32) {
        if self.rot % 2 == 1 {
            (self.h, self.w)
        } else {
            (self.w, self.h)
        }
    }

    /// Returns [left, top, right, bottom] in page space.
    pub fn rect(&self, r: &PdfRect) -> [f32; 4] {
        self.user_rect([r.left().value, r.bottom().value, r.right().value, r.top().value])
    }

    /// User-space [left, bottom, right, top] to displayed [left, top, right, bottom].
    pub fn user_rect(&self, r: [f32; 4]) -> [f32; 4] {
        let (ax, ay) = self.point(r[0], r[3]);
        let (bx, by) = self.point(r[2], r[1]);
        [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
    }

    /// Displayed [left, top, right, bottom] to user-space [left, bottom, right, top].
    pub fn display_rect(&self, r: [f32; 4]) -> [f32; 4] {
        let (ax, ay) = self.unpoint(r[0], r[1]);
        let (bx, by) = self.unpoint(r[2], r[3]);
        [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
    }
}

