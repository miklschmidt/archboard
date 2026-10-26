//! The layout's binding: one solve of a board, Track or Blocks, its measured
//! graph in and its answer out, each as JSON. A host's layout engine runs it
//! for each solve a render asks for (`crate::render`). Graphviz runs in the
//! core (`archboard_graphviz`, ADR 0058), so a solve asks its host for nothing.

use wasm_bindgen::prelude::*;

/// What a value the host threw or refused with says.
pub(crate) fn said(error: &JsValue, what: &str) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| error.as_string())
        .unwrap_or_else(|| format!("{what} failed without saying why"))
}

/// Lay a measured board out one way (`archboard_layout::lay_out_board`).
///
/// # Errors
///
/// A graph or options the layout cannot read, and a block's graph Graphviz refused.
#[wasm_bindgen(js_name = layOutBoard)]
pub fn lay_out_board(graph: &str) -> Result<String, JsValue> {
    archboard_layout::lay_out_board(graph, &mut archboard_graphviz::InCore)
        .map_err(|error| JsError::new(&error).into())
}
