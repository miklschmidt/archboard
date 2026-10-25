//! The flows' bindings: a sequence or a flowchart laid out and painted in one
//! call, the request in as the JSON of its TypeScript type and the picture out
//! as the JSON of its `PaintedDocument`.
//!
//! The host answers what a flowchart's layout asks of the place it runs in:
//! the track engine, until the core holds it (TASK-520.04). What crosses to
//! the host and back crosses as JSON.

use archboard_flows::flowchart::{self, Content, FlowchartHost, Measured};
use archboard_flows::sequence::{self, SequenceRequest};
use archboard_scene::drawing::Painted;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::scene::{painted_document, request_of};

#[wasm_bindgen(typescript_custom_section)]
const FLOWCHART_HOST: &str = r#"
/** What a flowchart's layout asks of the host: the track engine, each value as JSON. */
export interface FlowchartHost {
    /** The graph laid out by the track engine, as the JSON of its `PaintedDrawing`. */
    track(content: string, measured: string): Promise<string>;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// What a flowchart's layout asks of the host.
    #[wasm_bindgen(typescript_type = "FlowchartHost")]
    pub type FlowchartLayoutHost;

    #[wasm_bindgen(method, js_name = track)]
    fn track_of(this: &FlowchartLayoutHost, content: &str, measured: &str) -> js_sys::Promise;
}

/// A value as the JSON the host reads.
fn json_of(value: &impl Serialize) -> String {
    serde_json::to_string(value).expect("a layout value always writes as JSON")
}

impl FlowchartHost for FlowchartLayoutHost {
    type Error = JsValue;

    async fn track(&self, content: &Content, measured: &Measured) -> Result<Painted, JsValue> {
        let laid = JsFuture::from(self.track_of(&json_of(content), &json_of(measured))).await?;
        let laid = laid
            .as_string()
            .ok_or_else(|| JsError::new("The track engine answered no JSON"))?;
        serde_json::from_str(&laid).map_err(|error| {
            JsError::new(&format!(
                "The track engine's drawing does not match its type: {error}"
            ))
            .into()
        })
    }
}

/// A variant's flows laid out as a stack of message sequences and painted:
/// the JSON of a sequence request in, the JSON of its `PaintedDocument` out.
///
/// # Errors
///
/// A request that does not read as its type, and a document the SVG painter
/// refuses (`archboard_svg::document`).
#[wasm_bindgen(js_name = drawSequence)]
pub fn draw_sequence(request: &str) -> Result<String, JsError> {
    let request: SequenceRequest = request_of(request, "sequence")?;
    painted_document(&sequence::picture(request))
}

/// A reading's flows laid out as a flowchart and painted: the JSON of a
/// flowchart request in, the JSON of its `PaintedDocument` out, once the
/// host's track engine has laid the graph out.
///
/// # Errors
///
/// A request that does not read as its type, what the track engine failed
/// with or answered that does not read as a drawing, and a document the SVG
/// painter refuses.
#[wasm_bindgen(js_name = drawFlowchart)]
pub async fn draw_flowchart(request: String, host: FlowchartLayoutHost) -> Result<String, JsValue> {
    let request = request_of(&request, "flowchart")?;
    let paint = flowchart::picture(request, &host).await?;
    Ok(painted_document(&paint)?)
}
