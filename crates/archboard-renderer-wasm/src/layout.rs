//! The layout's binding: a Track solve, its measured graph in and its answer
//! out, each as the JSON of an ELK node.
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

/// Lay a measured Track graph out (`archboard_layout::lay_out_track`).
#[wasm_bindgen(js_name = layOutTrack)]
pub fn lay_out_track(graph: &str, graphviz: &GraphvizHost) -> Result<String, JsError> {
    archboard_layout::lay_out_track(graph, &mut Host(graphviz))
        .map_err(|error| JsError::new(&error))
}
