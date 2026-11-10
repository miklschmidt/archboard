//! The layout's binding: one solve of a picture, Track or Blocks, its measured
//! graph in and its answer out, each as JSON. A host's layout engine runs it
//! for each solve a render asks for (`crate::render`). Graphviz runs in the
//! core (`archboard_graphviz`, ADR 0060), so a solve asks its host for nothing.
//! A host with several layout workers lays a solve out across them
//! (`layOutAcross`, ADR 0078): a Blocks solve that takes a dense placement in
//! parts that the workers solve side by side, each with `layOutPicture`.

use archboard_layout::{Solver, Unsolved};
use wasm_bindgen::prelude::*;

use crate::render::{AbortSignal, Solving};

#[wasm_bindgen(typescript_custom_section)]
const PART_HOST: &str = r#"
/** Where a solve laid out across workers runs its parts. */
export interface PartHost {
    /**
     * One part, laid out as `layOutPicture` lays it out. The signal calls off
     * a part that still waits for a worker: it is refused with the signal's reason.
     */
    solve(graph: string, signal: AbortSignal): Promise<string>;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// Where a solve laid out across workers runs its parts.
    #[wasm_bindgen(typescript_type = "PartHost")]
    pub type PartHost;

    #[wasm_bindgen(method, catch, js_name = solve)]
    fn solve_on(this: &PartHost, graph: String, signal: &AbortSignal) -> Result<JsValue, JsValue>;
}

impl Solver for PartHost {
    type Solve<'s> = Solving;

    fn solve(&self, graph: String) -> Solving {
        Solving::asked(|signal| self.solve_on(graph, signal))
    }
}

/// What a value the host threw or refused with says.
pub(crate) fn said(error: &JsValue, what: &str) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| error.as_string())
        .unwrap_or_else(|| format!("{what} failed without saying why"))
}

/// Lay a measured picture out one way (`archboard_layout::lay_out_picture`).
///
/// # Errors
///
/// A graph or options the layout cannot read, and a block's graph Graphviz refused.
#[wasm_bindgen(js_name = layOutPicture)]
pub fn lay_out_picture(graph: &str) -> Result<String, JsValue> {
    archboard_layout::lay_out_picture(graph, &mut archboard_graphviz::InCore)
        .map_err(|error| JsError::new(&error).into())
}

/// Lay a measured picture out across the host's workers, to the answer that
/// `layOutPicture` gives it (`archboard_layout::lay_out_across`).
///
/// # Errors
///
/// What the host failed a part or the whole solve with.
#[wasm_bindgen(js_name = layOutAcross)]
pub async fn lay_out_across(graph: String, host: PartHost) -> Result<String, JsError> {
    archboard_layout::lay_out_across(&host, graph)
        .await
        .map_err(|error| match error {
            Unsolved::Failed(words) => JsError::new(&words),
            Unsolved::CalledOff => JsError::new("The layout solve was called off."),
        })
}
