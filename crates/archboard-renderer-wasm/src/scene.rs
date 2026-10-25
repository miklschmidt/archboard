//! The painter's bindings: a paint request in, as the JSON of its generated
//! TypeScript type, and the picture out, as a scene or as a document.
//!
//! The host measures text with the canvas of the place that draws the picture
//! (`TextMeasure`), until the core shapes text itself (TASK-520.07).

use archboard_scene::drawing::{DiagramFont, FontFamily};
use archboard_scene::measure::Measure;
use archboard_scene::paint::paint as paint_scene;
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::PaintedDocument;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TEXT_MEASURE: &str = r#"
/** The host's measure of one line of text, in diagram units, to a hundredth of a unit. */
export interface TextMeasure {
    width(text: string, family: "sans" | "mono", weight: 400 | 500, size: number): number;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// The host's measure of text: `width(text, family, weight, size)` in
    /// diagram units, to a hundredth of a unit.
    #[wasm_bindgen(typescript_type = "TextMeasure")]
    pub type TextMeasure;

    #[wasm_bindgen(method)]
    fn width(this: &TextMeasure, text: &str, family: &str, weight: u16, size: f64) -> f64;
}

impl Measure for TextMeasure {
    fn width(&self, text: &str, font: DiagramFont, size: f64) -> f64 {
        let family = match font.family {
            FontFamily::Sans => "sans",
            FontFamily::Mono => "mono",
        };
        TextMeasure::width(self, text, family, font.weight, size)
    }
}

/// A request read from its JSON.
fn request_of(request: &str) -> Result<PaintRequest, JsError> {
    serde_json::from_str(request).map_err(|error| {
        JsError::new(&format!(
            "The paint request does not match its type: {error}"
        ))
    })
}

/// One picture painted into a scene: the JSON of a `PaintRequest` in, the
/// JSON of its `Scene` out.
#[wasm_bindgen(js_name = paintScene)]
pub fn scene(request: &str, measure: &TextMeasure) -> Result<String, JsError> {
    let scene = paint_scene(&request_of(request)?, measure);
    serde_json::to_string(&scene).map_err(|error| JsError::new(&error.to_string()))
}

/// One picture painted and written as an SVG document: the JSON of a
/// `PaintRequest` in, the JSON of its `PaintedDocument` out.
#[wasm_bindgen(js_name = paintDocument)]
pub fn document(request: &str, measure: &TextMeasure) -> Result<String, JsError> {
    painted_document(&request_of(request)?, measure)
}

/// One picture painted and written as an SVG document: the JSON of its
/// `PaintedDocument`.
pub(crate) fn painted_document(
    request: &PaintRequest,
    measure: &dyn Measure,
) -> Result<String, JsError> {
    let scene = paint_scene(request, measure);
    let svg = archboard_svg::document(&scene, &request.document)
        .map_err(|error| JsError::new(&error.0))?;
    let painted = PaintedDocument {
        svg,
        width: scene.width,
        height: scene.height,
        atlas: scene.atlas,
        placed: scene.placed,
        reading_direction: scene.reading,
    };
    serde_json::to_string(&painted).map_err(|error| JsError::new(&error.to_string()))
}
