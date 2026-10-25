//! The flows' bindings: a sequence or a flowchart laid out and painted in one
//! call, the request in as the JSON of its TypeScript type and the picture out
//! as the JSON of its `PaintedDocument`.
//!
//! The host answers what the layout asks of the place it runs in: its text,
//! until the core shapes text itself (TASK-520.07), and for a flowchart the
//! track engine, until the core holds it (TASK-520.04). What crosses to the
//! host and back crosses as JSON.

use archboard_flows::flowchart::{self, Content, FarSubject, FlowchartHost, GraphNode, Measured};
use archboard_flows::sequence::{self, SequenceRequest};
use archboard_flows::text::Text;
use archboard_scene::drawing::{
    DiagramFont, FontFamily, MeasuredLabel, MeasuredNode, Painted, TextRun,
};
use archboard_scene::measure::Measure;
use archboard_scene::request::WordLine;
use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::scene::painted_document;

#[wasm_bindgen(typescript_custom_section)]
const LAYOUT_HOST: &str = r#"
/**
 * The host's text as a layout reads it: each width as `TextMeasure` gives
 * it, and lines broken as the host's line breaker breaks them, as JSON.
 */
export interface LayoutText extends TextMeasure {
    /** A note's lines, as the JSON of `TextRun[]`. */
    noteLines(text: string, width: number, size: number, lineHeight: number): string;
    /** A message's lines, as the JSON of `WordLine[]`. */
    messageLines(text: string, width: number, size: number, lineHeight: number): string;
}

/** What a flowchart's layout asks of the host: its text, and the track engine, each value as JSON. */
export interface FlowchartHost extends LayoutText {
    /** A node's box and words, as the JSON of a `MeasuredNode`. */
    measureNode(node: string, container: boolean): string;
    /** A line's words on their plate, as the JSON of a `MeasuredLabel`. */
    measureLabel(words: string): string;
    /** The size every card's name is set at from far away. */
    farSize(subjects: string): number;
    /** The graph laid out by the track engine, as the JSON of its `PaintedDrawing`. */
    track(content: string, measured: string): Promise<string>;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// The host's text, as a layout reads it.
    #[wasm_bindgen(typescript_type = "LayoutText")]
    pub type LayoutText;

    #[wasm_bindgen(method, js_name = width)]
    fn text_width(this: &LayoutText, text: &str, family: &str, weight: u16, size: f64) -> f64;

    #[wasm_bindgen(method, js_name = noteLines)]
    fn note_lines_of(this: &LayoutText, text: &str, width: f64, size: f64, line: f64) -> String;

    #[wasm_bindgen(method, js_name = messageLines)]
    fn message_lines_of(this: &LayoutText, text: &str, width: f64, size: f64, line: f64) -> String;

    /// What a flowchart's layout asks of the host.
    #[wasm_bindgen(typescript_type = "FlowchartHost", extends = LayoutText)]
    pub type FlowchartLayoutHost;

    #[wasm_bindgen(method, js_name = measureNode)]
    fn measure_node_of(this: &FlowchartLayoutHost, node: &str, container: bool) -> String;

    #[wasm_bindgen(method, js_name = measureLabel)]
    fn measure_label_of(this: &FlowchartLayoutHost, words: &str) -> String;

    #[wasm_bindgen(method, js_name = farSize)]
    fn far_size_of(this: &FlowchartLayoutHost, subjects: &str) -> f64;

    #[wasm_bindgen(method, js_name = track)]
    fn track_of(this: &FlowchartLayoutHost, content: &str, measured: &str) -> js_sys::Promise;
}

/// What the host answered, read from its JSON: the host's own functions write
/// it, so an answer that does not read is a fault of this build.
fn answer<T: DeserializeOwned>(json: &str, what: &str) -> T {
    serde_json::from_str(json)
        .unwrap_or_else(|error| panic!("The host's {what} does not match its type: {error}"))
}

/// A value as the JSON the host reads.
fn json_of(value: &impl Serialize) -> String {
    serde_json::to_string(value).expect("a layout value always writes as JSON")
}

/// A request read from its JSON.
fn request_of<T: DeserializeOwned>(request: &str, what: &str) -> Result<T, JsError> {
    serde_json::from_str(request).map_err(|error| {
        JsError::new(&format!(
            "The {what} request does not match its type: {error}"
        ))
    })
}

impl Measure for LayoutText {
    fn width(&self, text: &str, font: DiagramFont, size: f64) -> f64 {
        let family = match font.family {
            FontFamily::Sans => "sans",
            FontFamily::Mono => "mono",
        };
        self.text_width(text, family, font.weight, size)
    }
}

impl Text for LayoutText {
    fn note_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun> {
        answer(
            &self.note_lines_of(text, width, size, line_height),
            "note lines",
        )
    }

    fn message_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<WordLine> {
        answer(
            &self.message_lines_of(text, width, size, line_height),
            "message lines",
        )
    }
}

impl Measure for FlowchartLayoutHost {
    fn width(&self, text: &str, font: DiagramFont, size: f64) -> f64 {
        Measure::width(&**self, text, font, size)
    }
}

impl Text for FlowchartLayoutHost {
    fn note_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun> {
        Text::note_lines(&**self, text, width, size, line_height)
    }

    fn message_lines(&self, text: &str, width: f64, size: f64, line_height: f64) -> Vec<WordLine> {
        Text::message_lines(&**self, text, width, size, line_height)
    }
}

impl FlowchartHost for FlowchartLayoutHost {
    type Error = JsValue;

    fn measure_node(&self, node: &GraphNode, container: bool) -> MeasuredNode<GraphNode> {
        answer(
            &self.measure_node_of(&json_of(node), container),
            "measured node",
        )
    }

    fn measure_label(&self, words: &str) -> MeasuredLabel {
        answer(&self.measure_label_of(words), "measured label")
    }

    fn far_size(&self, subjects: &[FarSubject<'_>]) -> f64 {
        self.far_size_of(&json_of(&subjects))
    }

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
#[wasm_bindgen(js_name = drawSequence)]
pub fn draw_sequence(request: &str, text: &LayoutText) -> Result<String, JsError> {
    let request: SequenceRequest = request_of(request, "sequence")?;
    painted_document(&sequence::picture(request, text), text)
}

/// A reading's flows laid out as a flowchart and painted: the JSON of a
/// flowchart request in, the JSON of its `PaintedDocument` out, once the
/// host's track engine has laid the graph out.
#[wasm_bindgen(js_name = drawFlowchart)]
pub async fn draw_flowchart(request: String, host: FlowchartLayoutHost) -> Result<String, JsValue> {
    let request = request_of(&request, "flowchart")?;
    let paint = flowchart::picture(request, &host).await?;
    Ok(painted_document(&paint, &host)?)
}
