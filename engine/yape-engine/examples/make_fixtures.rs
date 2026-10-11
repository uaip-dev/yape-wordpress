// SPDX-License-Identifier: MIT
//! Writes the test PDFs in `engine/tests/fixtures/`:
//!   hello.pdf            two Letter pages with Helvetica text
//!   hello-protected.pdf  the same, AES-256 encrypted with user password "secret"
//!
//! Run: cargo run -p yape-engine --example make_fixtures

use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};
use std::path::PathBuf;
use yape_engine::protect::{encrypt, Protection};

fn page_content(lines: &[&str]) -> Vec<u8> {
    let mut ops = vec![Operation::new("BT", vec![]), Operation::new("Tf", vec!["F1".into(), 24.into()])];
    ops.push(Operation::new("Td", vec![72.into(), 700.into()]));
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            ops.push(Operation::new("Td", vec![0.into(), (-36).into()]));
        }
        ops.push(Operation::new("Tj", vec![Object::string_literal(*line)]));
    }
    ops.push(Operation::new("ET", vec![]));
    // A grey box so rendering has something non-text to check.
    ops.extend([
        Operation::new("rg", vec![0.8.into(), 0.8.into(), 0.8.into()]),
        Operation::new("re", vec![72.into(), 400.into(), 200.into(), 100.into()]),
        Operation::new("f", vec![]),
    ]);
    Content { operations: ops }.encode().unwrap()
}

fn main() {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding",
    });
    let resources_id = doc.add_object(dictionary! { "Font" => dictionary! { "F1" => font_id } });
    let texts: [&[&str]; 2] = [
        &["Hello from YAPE", "Page one of the engine spike."],
        &["Second page", "Annotations persist after save."],
    ];
    let mut kids = Vec::new();
    for lines in texts {
        let content_id = doc.add_object(Stream::new(dictionary! {}, page_content(lines)));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        });
        kids.push(Object::Reference(page_id));
    }
    let count = kids.len() as i64;
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => count }));
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);
    let info_id = doc.add_object(dictionary! { "Title" => Object::string_literal("YAPE engine spike") });
    doc.trailer.set("Info", info_id);
    doc.compress();

    let mut plain = Vec::new();
    doc.save_to(&mut plain).unwrap();
    let protected = encrypt(
        &plain,
        &Protection { user_password: "secret".into(), owner_password: "owner".into(), allow_print: true, allow_copy: true, allow_edit: true },
    )
    .unwrap();

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("hello.pdf"), &plain).unwrap();
    std::fs::write(dir.join("hello-protected.pdf"), &protected).unwrap();
    println!("wrote {} ({} + {} bytes)", dir.display(), plain.len(), protected.len());
}
