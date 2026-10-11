// SPDX-License-Identifier: MIT
//! Annotation writing (lopdf only, so these run without PDFium).

use yape_engine::annots::{create, NewAnnot};
use yape_engine::geom::Geom;
use yape_engine::protect;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/fixtures/").to_string() + name).unwrap()
}

fn annot_count(bytes: &[u8], page: u32) -> usize {
    let doc = lopdf::Document::load_mem(bytes).unwrap();
    let page_id = doc.get_pages()[&page];
    let page = doc.get_dictionary(page_id).unwrap();
    match page.get(b"Annots") {
        Ok(lopdf::Object::Array(a)) => a.len(),
        Ok(lopdf::Object::Reference(r)) => doc.get_object(*r).unwrap().as_array().unwrap().len(),
        _ => 0,
    }
}

#[test]
fn rectangle_is_appended_as_incremental_update() {
    let bytes = fixture("hello.pdf");
    let geom = Geom::from_box([0.0, 0.0, 612.0, 792.0]);
    let new: NewAnnot = serde_json::from_str(
        r#"{"type":"shape","kind":"rectangle","rect":[72,72,272,172],"color":[255,0,0],"width":2}"#,
    )
    .unwrap();
    let out = create(&bytes, 0, &geom, new, "spike").unwrap();
    assert!(out.starts_with(&bytes), "original bytes are kept as-is");
    assert_eq!(annot_count(&bytes, 1), 0);
    assert_eq!(annot_count(&out, 1), 1);

    let new: NewAnnot =
        serde_json::from_str(r#"{"type":"markup","kind":"highlight","rects":[[72,80,300,110]],"color":[255,230,0]}"#)
            .unwrap();
    let out2 = create(&out, 0, &geom, new, "").unwrap();
    assert_eq!(annot_count(&out2, 1), 2);
}

#[test]
fn protected_fixture_round_trips() {
    let bytes = fixture("hello-protected.pdf");
    assert!(protect::decrypt(&bytes, "wrong").is_err() || lopdf::Document::load_mem(&bytes).unwrap().is_encrypted());
    let (plain, p) = protect::decrypt(&bytes, "secret").unwrap();
    assert!(!lopdf::Document::load_mem(&plain).unwrap().is_encrypted());
    let again = protect::encrypt(&plain, &p).unwrap();
    assert!(lopdf::Document::load_mem(&again).unwrap().is_encrypted());
}
