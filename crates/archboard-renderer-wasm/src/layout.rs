//! The layout's binding: one solve of a board, Track or Blocks, its measured
//! graph in and its answer out, each as the JSON of an ELK node; and what the
//! renderer weighs where it chooses between the solves of one board, from
//! what those solves told (`archboard_layout::draws_better` and its kin).
//!
//! The host runs Graphviz (`GraphvizHost`): the core hands it each graph as
//! the JSON of a viz-js `Graph` object, and the host answers what viz-js
//! renders of it as `json0`, y inverted.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const GRAPHVIZ_HOST: &str = r#"
/** The host's Graphviz: one graph, the JSON of a viz-js `Graph`, laid out and answered as its `json0` output, y inverted. */
export interface GraphvizHost {
    render(graph: string): string;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// The host's Graphviz.
    #[wasm_bindgen(typescript_type = "GraphvizHost")]
    pub type GraphvizHost;

    #[wasm_bindgen(method, catch)]
    fn render(this: &GraphvizHost, graph: &str) -> Result<String, JsValue>;
}

/// The host's Graphviz, as the layout asks for it.
struct Host<'a>(&'a GraphvizHost);

impl archboard_layout::Graphviz for Host<'_> {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        self.0.render(graph).map_err(|error| {
            error
                .as_string()
                .unwrap_or_else(|| format!("Graphviz refused a graph: {error:?}"))
        })
    }
}

/// Lay a measured board out one way (`archboard_layout::lay_out_board`).
///
/// # Errors
///
/// A graph or options the layout cannot read, and a block's graph Graphviz refused.
#[wasm_bindgen(js_name = layOutBoard)]
pub fn lay_out_board(graph: &str, graphviz: &GraphvizHost) -> Result<String, JsError> {
    archboard_layout::lay_out_board(graph, &mut Host(graphviz))
        .map_err(|error| JsError::new(&error))
}

/// Whether one drawing reads better than another, each as its solve's
/// reading told it (`archboard_layout::draws_better`).
///
/// # Errors
///
/// A reading that is not one a solve told.
#[wasm_bindgen(js_name = drawsBetter)]
pub fn draws_better(one: &str, other: &str) -> Result<bool, JsError> {
    archboard_layout::draws_better(one, other).map_err(|error| JsError::new(&error))
}

/// Whether a board laid out with its groups packed reads better than laid
/// inline, each as its solve's reading told it
/// (`archboard_layout::reads_better_packed`).
///
/// # Errors
///
/// A reading that is not one a solve told.
#[wasm_bindgen(js_name = readsBetterPacked)]
pub fn reads_better_packed(packed: &str, inline: &str) -> Result<bool, JsError> {
    archboard_layout::reads_better_packed(packed, inline).map_err(|error| JsError::new(&error))
}

/// Whether a board's first block that could stack stacks, from what a solve
/// laying it stacked and one laying it plain told it stood at
/// (`archboard_layout::stacks_of`).
///
/// # Errors
///
/// What a solve did not tell.
#[wasm_bindgen(js_name = stacksOf)]
pub fn stacks_of(stacked: &str, plain: &str) -> Result<bool, JsError> {
    archboard_layout::stacks_of(stacked, plain).map_err(|error| JsError::new(&error))
}

/// The blocks whose joins the renderer keeps whole one way or the other, a
/// measured graph drawn as a nesting names (`archboard_layout::joining_of`).
///
/// # Errors
///
/// A graph, options or nesting the layout cannot read.
#[wasm_bindgen(js_name = joiningOf)]
pub fn joining_of(graph: &str, nesting: &str) -> Result<Vec<String>, JsError> {
    archboard_layout::joining_of(graph, nesting).map_err(|error| JsError::new(&error))
}

/// Whether a measured board drawn inline gathers any group into a region
/// (`archboard_layout::has_regions`).
///
/// # Errors
///
/// A graph or options the layout cannot read.
#[wasm_bindgen(js_name = hasRegions)]
pub fn has_regions(graph: &str) -> Result<bool, JsError> {
    archboard_layout::has_regions(graph).map_err(|error| JsError::new(&error))
}
