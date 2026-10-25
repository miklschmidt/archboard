//! The layout's binding: one solve of a board, Track or Blocks, its measured
//! graph in and its answer out, each as JSON. A host's layout engine runs it
//! for each solve a render asks for (`crate::render`).
//!
//! The host runs Graphviz (`GraphvizHost`): the core hands it each graph as
//! a viz-js `Graph` object, and the host answers what viz-js renders of it as
//! `json0`, y inverted.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const GRAPHVIZ_HOST: &str = r#"
/** The host's Graphviz: one graph laid out and answered as its `json0` output, y inverted. */
export interface GraphvizHost {
    render(graph: import("@viz-js/viz").Graph): string;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// The host's Graphviz.
    #[wasm_bindgen(typescript_type = "GraphvizHost")]
    pub type GraphvizHost;

    #[wasm_bindgen(method, catch)]
    fn render(this: &GraphvizHost, graph: &JsValue) -> Result<String, JsValue>;
}

/// What a value the host threw or refused with says.
pub(crate) fn said(error: &JsValue, what: &str) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| error.as_string())
        .unwrap_or_else(|| format!("{what} failed without saying why"))
}

/// The host's Graphviz, as the layout asks for it.
struct Host<'a>(&'a GraphvizHost);

impl archboard_layout::Graphviz for Host<'_> {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        let graph = js_sys::JSON::parse(graph).map_err(|error| said(&error, "Reading a graph"))?;
        self.0
            .render(&graph)
            .map_err(|error| said(&error, "Graphviz"))
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
