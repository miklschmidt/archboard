//! The renderer core as WebAssembly. Bun and the browser load this one build
//! (ADR 0057), and `scripts/build-core.ts` makes it.

use wasm_bindgen::prelude::*;

/// The hash of the core sources this build was made from, as
/// `scripts/build-core.ts` recorded it. A host compares it with the sources in
/// its checkout and refuses a build made from other sources. A build made
/// without the script records none.
#[wasm_bindgen(js_name = sourceHash)]
pub fn source_hash() -> String {
    option_env!("ARCHBOARD_CORE_SOURCE_HASH")
        .unwrap_or("unrecorded")
        .to_owned()
}
