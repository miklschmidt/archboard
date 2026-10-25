//! The painter's bindings: a paint request in, as the JSON of its generated
//! TypeScript type, and the picture out as the JSON of its `PaintedDocument`;
//! and a board's words measured before its layout places anything.

use archboard_scene::measure::{BoardWords, measure_board};
use archboard_scene::paint::paint as paint_scene;
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::PaintedDocument;
use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;

/// A request read from its JSON.
pub(crate) fn request_of<T: DeserializeOwned>(request: &str, what: &str) -> Result<T, JsError> {
    serde_json::from_str(request).map_err(|error| {
        JsError::new(&format!(
            "The {what} request does not match its type: {error}"
        ))
    })
}

/// A board's words measured: the JSON of its `BoardWords` in, the JSON of
/// their `MeasuredWords` out.
///
/// # Errors
///
/// A request that does not read as `BoardWords`.
#[wasm_bindgen(js_name = measureBoard)]
pub fn measure(request: &str) -> Result<String, JsError> {
    let words: BoardWords = request_of(request, "words")?;
    serde_json::to_string(&measure_board(&words)).map_err(|error| JsError::new(&error.to_string()))
}

/// One picture painted and written as an SVG document: the JSON of a
/// `PaintRequest` in, the JSON of its `PaintedDocument` out.
///
/// # Errors
///
/// A request that does not read as a `PaintRequest`, and a document the SVG
/// painter refuses (`archboard_svg::document`).
#[wasm_bindgen(js_name = paintDocument)]
pub fn document(request: &str) -> Result<String, JsError> {
    painted_document(&request_of(request, "paint")?)
}

/// One picture painted and written as an SVG document: the JSON of its
/// `PaintedDocument`.
pub(crate) fn painted_document(request: &PaintRequest) -> Result<String, JsError> {
    let scene = paint_scene(request);
    let svg = archboard_svg::document(&scene, &request.document, &request.icons)
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
