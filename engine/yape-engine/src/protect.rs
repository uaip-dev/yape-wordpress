// SPDX-License-Identifier: MIT
//! Password protection.
//!
//! Password-protected PDFs are decrypted in memory when opened (`decrypt`),
//! so every editing feature works on them; `Protection` is applied again when
//! the document is saved (`encrypt`). Encryption keys come from `getrandom`
//! (crypto.getRandomValues in the browser).

use lopdf::encryption::crypt_filters::{Aes256CryptFilter, CryptFilter};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

fn lo(e: lopdf::Error) -> String {
    format!("PDF structure error: {e}")
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Protection {
    /// Password needed to open the document ("" = opens freely, restrictions only).
    pub user_password: String,
    /// Password needed to change restrictions; random when not given.
    #[serde(default)]
    pub owner_password: String,
    pub allow_print: bool,
    pub allow_copy: bool,
    pub allow_edit: bool,
}

/// Decrypts a password-protected PDF in memory. Returns the plain bytes and
/// the protection to re-apply on save.
pub fn decrypt(bytes: &[u8], password: &str) -> Result<(Vec<u8>, Protection), String> {
    // load_mem() does not load the objects of an encrypted file; the
    // password-aware loader decrypts them while parsing.
    let doc = lopdf::Document::load_mem_with_options(bytes, lopdf::LoadOptions::with_password(password)).map_err(|e| format!("Could not decrypt: {e}"))?;
    let perms = doc
        .encryption_state
        .as_ref()
        .map(|s| s.permissions())
        .unwrap_or(lopdf::Permissions::all());
    let mut doc = doc;
    doc.encryption_state = None;
    doc.trailer.remove(b"Encrypt");
    let mut out = Vec::with_capacity(bytes.len());
    doc.save_to(&mut out).map_err(|e| format!("Could not write the PDF: {e}"))?;
    let protection = Protection {
        user_password: password.to_string(),
        owner_password: String::new(),
        allow_print: perms.contains(lopdf::Permissions::PRINTABLE),
        allow_copy: perms.contains(lopdf::Permissions::COPYABLE),
        allow_edit: perms.contains(lopdf::Permissions::MODIFIABLE),
    };
    Ok((out, protection))
}

fn random_password() -> String {
    let mut b = [0u8; 18];
    let _ = getrandom::fill(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Encrypts plain PDF bytes with AES-256 (PDF 2.0, revision 6).
pub fn encrypt(bytes: &[u8], p: &Protection) -> Result<Vec<u8>, String> {
    let mut doc = lopdf::Document::load_mem(bytes).map_err(lo)?;
    let mut perms = lopdf::Permissions::COPYABLE_FOR_ACCESSIBILITY;
    if p.allow_print {
        perms |= lopdf::Permissions::PRINTABLE | lopdf::Permissions::PRINTABLE_IN_HIGH_QUALITY;
    }
    if p.allow_copy {
        perms |= lopdf::Permissions::COPYABLE;
    }
    if p.allow_edit {
        perms |= lopdf::Permissions::MODIFIABLE | lopdf::Permissions::ANNOTABLE | lopdf::Permissions::FILLABLE | lopdf::Permissions::ASSEMBLABLE;
    }
    let owner = if p.owner_password.is_empty() { random_password() } else { p.owner_password.clone() };
    let mut key = [0u8; 32];
    getrandom::fill(&mut key).map_err(|e| format!("No secure random source: {e}"))?;
    let filter: Arc<dyn CryptFilter> = Arc::new(Aes256CryptFilter);
    let version = lopdf::EncryptionVersion::V5 {
        encrypt_metadata: true,
        crypt_filters: BTreeMap::from([(b"StdCF".to_vec(), filter)]),
        file_encryption_key: &key,
        stream_filter: b"StdCF".to_vec(),
        string_filter: b"StdCF".to_vec(),
        owner_password: &owner,
        user_password: &p.user_password,
        permissions: perms,
    };
    let state = lopdf::EncryptionState::try_from(version).map_err(lo)?;
    doc.encrypt(&state).map_err(lo)?;
    let mut out = Vec::with_capacity(bytes.len());
    doc.save_to(&mut out).map_err(|e| format!("Could not write the PDF: {e}"))?;
    Ok(out)
}

