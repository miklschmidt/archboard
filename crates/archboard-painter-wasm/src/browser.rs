//! The painter a page holds: one stage, and the surface its frames land on.

use std::collections::{HashMap, HashSet};

use archboard_paint::cpu::CpuCanvas;
use archboard_paint::flight::DiveWay;
use archboard_paint::palette::Theme;
use archboard_paint::presentation::{Camera, Light, Marks};
use archboard_paint::stage::Stage;
use archboard_scene::geometry::Rect;
use archboard_scene::scene::Painting;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen::{Clamped, JsCast};
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

use crate::gpu::GpuTarget;

/// Where a frame lands.
enum Target {
    Gpu(Box<GpuTarget>),
    Cpu {
        canvas: Box<CpuCanvas>,
        context: CanvasRenderingContext2d,
    },
}

/// A flight between a board and the board inside its card, as a page states it.
#[derive(Deserialize)]
struct DiveFlight {
    way: DiveWay,
    card: String,
    frame: Rect,
}

/// A theme by whether it is dark.
fn theme_of(dark: bool) -> Theme {
    if dark { Theme::Dark } else { Theme::Light }
}

/// JSON that did not read, as an error.
#[expect(
    clippy::needless_pass_by_value,
    reason = "this is the shape map_err asks for"
)]
fn unread(error: serde_json::Error) -> JsError {
    JsError::new(&error.to_string())
}

/// A refusal of the page as an error.
fn refused(error: &JsValue) -> JsError {
    JsError::new(&format!("{error:?}"))
}

/// One canvas's painter.
#[wasm_bindgen]
#[expect(
    missing_debug_implementations,
    reason = "a page holds this as an opaque handle"
)]
pub struct Painter {
    stage: Stage,
    target: Target,
}

#[wasm_bindgen]
impl Painter {
    /// Start Vello on WebGPU on a canvas.
    ///
    /// # Errors
    ///
    /// WebGPU gave no adapter, device or surface. A canvas that took a WebGPU
    /// context takes no other, so the page falls back on a new canvas.
    pub async fn gpu(canvas: HtmlCanvasElement, dark: bool) -> Result<Painter, JsError> {
        let size = (f64::from(canvas.width()), f64::from(canvas.height()));
        let target = GpuTarget::start(canvas).await?;
        Ok(Painter {
            stage: Stage::new(theme_of(dark), size),
            target: Target::Gpu(Box::new(target)),
        })
    }

    /// Start Vello on the CPU on a canvas.
    ///
    /// # Errors
    ///
    /// The canvas gave no 2D context.
    pub fn cpu(canvas: &HtmlCanvasElement, dark: bool) -> Result<Painter, JsError> {
        let context = canvas
            .get_context("2d")
            .ok()
            .flatten()
            .and_then(|context| context.dyn_into::<CanvasRenderingContext2d>().ok())
            .ok_or_else(|| JsError::new("The canvas gave no 2D context."))?;
        let (width, height) = (canvas.width(), canvas.height());
        Ok(Painter {
            stage: Stage::new(theme_of(dark), (f64::from(width), f64::from(height))),
            target: Target::Cpu {
                canvas: Box::new(cpu_canvas(width, height)),
                context,
            },
        })
    }

    /// Put a picture on the stage.
    ///
    /// # Errors
    ///
    /// The painting does not read as one.
    pub fn show(&mut self, painting: &str) -> Result<(), JsError> {
        let painting: Painting = serde_json::from_str(painting).map_err(unread)?;
        self.stage.show(painting);
        Ok(())
    }

    /// Say at which points of a move each of its parts happens, as JSON.
    ///
    /// # Errors
    ///
    /// The phases do not read as phases.
    #[wasm_bindgen(js_name = setPhases)]
    pub fn set_phases(&mut self, phases: &str) -> Result<(), JsError> {
        self.stage
            .set_phases(serde_json::from_str(phases).map_err(unread)?);
        Ok(())
    }

    /// Carry the picture on the stage into the next.
    ///
    /// # Errors
    ///
    /// The painting does not read as one.
    pub fn carry(
        &mut self,
        painting: &str,
        shift_x: f64,
        shift_y: f64,
        ms: f64,
    ) -> Result<(), JsError> {
        let painting: Painting = serde_json::from_str(painting).map_err(unread)?;
        self.stage.carry(painting, (shift_x, shift_y), ms);
        Ok(())
    }

    /// Bring a picture in part by part, what is left of the last one finishing
    /// over it, moved with its pane by a distance in canvas pixels.
    ///
    /// # Errors
    ///
    /// The painting does not read as one.
    pub fn enter(
        &mut self,
        painting: &str,
        heading: &str,
        ms: f64,
        moved_x: f64,
        moved_y: f64,
        now: f64,
    ) -> Result<(), JsError> {
        let painting: Painting = serde_json::from_str(painting).map_err(unread)?;
        let heading = serde_json::from_str(heading).map_err(unread)?;
        self.stage
            .enter(painting, heading, ms, (moved_x, moved_y), now);
        Ok(())
    }

    /// Land whatever flies, at once.
    pub fn land(&mut self) {
        self.stage.land();
    }

    /// Send the picture on its way out, a heading in JSON.
    ///
    /// # Errors
    ///
    /// The heading does not read as one.
    pub fn leave(&mut self, heading: &str, ms: f64, now: f64) -> Result<(), JsError> {
        let heading = serde_json::from_str(heading).map_err(unread)?;
        self.stage.leave(heading, ms, now);
        Ok(())
    }

    /// Bring back a picture the reader returned to.
    pub fn stay(&mut self) {
        self.stage.stay();
    }

    /// Put a board inside its card and start the flight's fades. `flight` names
    /// `{"way","card","frame"}` in JSON.
    ///
    /// # Errors
    ///
    /// The painting or the flight does not read.
    pub fn dive(&mut self, painting: &str, flight: &str, ms: f64, now: f64) -> Result<(), JsError> {
        let painting: Painting = serde_json::from_str(painting).map_err(unread)?;
        let flight: DiveFlight = serde_json::from_str(flight).map_err(unread)?;
        self.stage
            .dive(painting, flight.frame, (flight.way, flight.card), ms, now);
        Ok(())
    }

    /// Take the board inside a card away.
    #[wasm_bindgen(js_name = endDive)]
    pub fn end_dive(&mut self) {
        self.stage.end_dive();
    }

    /// Take the picture off the stage.
    pub fn clear(&mut self) {
        self.stage.clear();
    }

    /// Change the theme.
    #[wasm_bindgen(js_name = setTheme)]
    pub fn set_theme(&mut self, dark: bool) {
        self.stage.set_theme(theme_of(dark));
    }

    /// Move the picture on the canvas, in canvas pixels, over a time in milliseconds.
    #[wasm_bindgen(js_name = setCamera)]
    pub fn set_camera(&mut self, x: f64, y: f64, scale: f64, ms: f64, now: f64) {
        self.stage.set_camera(Camera { x, y, scale }, ms, now);
    }

    /// Swap between the near and the far view, over a time in milliseconds.
    #[wasm_bindgen(js_name = setFar)]
    pub fn set_far(&mut self, far: bool, ms: f64, now: f64) {
        self.stage.set_far(far, ms, now);
    }

    /// Say what is marked on the picture, as JSON.
    ///
    /// # Errors
    ///
    /// The marks do not read as marks.
    #[wasm_bindgen(js_name = setMarks)]
    pub fn set_marks(&mut self, marks: &str) -> Result<(), JsError> {
        let marks: Marks = serde_json::from_str(marks).map_err(unread)?;
        self.stage.set_marks(marks);
        Ok(())
    }

    /// Hold the flow heads down from where the picture drew them, as JSON: an
    /// object of drops in the picture's units, by flow id. A flow the object
    /// does not name stays where the picture drew it.
    ///
    /// # Errors
    ///
    /// The heads do not read as an object of numbers.
    #[wasm_bindgen(js_name = setHeads)]
    pub fn set_heads(&mut self, heads: &str) -> Result<(), JsError> {
        let heads: HashMap<String, f64> = serde_json::from_str(heads).map_err(unread)?;
        self.stage.set_heads(heads);
        Ok(())
    }

    /// Name the subject whose control the pointer rests on, or none.
    #[wasm_bindgen(js_name = setHoveredToggle)]
    #[expect(
        clippy::needless_pass_by_value,
        reason = "wasm-bindgen takes an optional string by value, and not by reference"
    )]
    pub fn set_hovered_toggle(&mut self, subject: Option<String>) {
        self.stage.set_hovered_toggle(subject.as_deref());
    }

    /// Say which subjects the code check warns about, as JSON: an array of ids.
    ///
    /// # Errors
    ///
    /// The warnings do not read as an array of ids.
    #[wasm_bindgen(js_name = setWarnings)]
    pub fn set_warnings(&mut self, warned: &str) -> Result<(), JsError> {
        let warned: HashSet<String> = serde_json::from_str(warned).map_err(unread)?;
        self.stage.set_warnings(warned);
        Ok(())
    }

    /// Show the traffic, or hide it for a person who asked for no motion.
    #[wasm_bindgen(js_name = setTrafficShown)]
    pub fn set_traffic_shown(&mut self, shown: bool) {
        self.stage.set_traffic_shown(shown);
    }

    /// Stand the traffic still, and keep it so until it is resumed.
    #[wasm_bindgen(js_name = holdTraffic)]
    pub fn hold_traffic(&mut self) {
        self.stage.hold_traffic();
    }

    /// Bring the held traffic back to its speed over a time in milliseconds.
    #[wasm_bindgen(js_name = resumeTraffic)]
    pub fn resume_traffic(&mut self, ms: f64, now: f64) {
        self.stage.resume_traffic(ms, now);
    }

    /// Let the held traffic go at its speed at once.
    #[wasm_bindgen(js_name = releaseTraffic)]
    pub fn release_traffic(&mut self) {
        self.stage.release_traffic();
    }

    /// Stand the traffic's clock at a time in seconds.
    #[wasm_bindgen(js_name = setPictureTime)]
    pub fn set_picture_time(&mut self, seconds: f64) {
        self.stage.set_picture_time(seconds);
    }

    /// Where the traffic's clock stands, in seconds.
    #[wasm_bindgen(js_name = pictureTime)]
    pub fn picture_time(&self) -> f64 {
        self.stage.picture_time()
    }

    /// Draw on the lines of the relationships that light, as JSON: an object of
    /// delays in milliseconds, by relationship id. A line takes its length over
    /// a speed, between the shortest and the longest time in milliseconds.
    ///
    /// # Errors
    ///
    /// The delays do not read as an object of numbers.
    pub fn sweep(
        &mut self,
        delays: &str,
        shortest: f64,
        longest: f64,
        now: f64,
    ) -> Result<(), JsError> {
        let delays: HashMap<String, f64> = serde_json::from_str(delays).map_err(unread)?;
        self.stage.sweep(&delays, shortest, longest, now);
        Ok(())
    }

    /// Take the sweep away.
    #[wasm_bindgen(js_name = clearSweep)]
    pub fn clear_sweep(&mut self) {
        self.stage.clear_sweep();
    }

    /// Light the picture, as JSON.
    ///
    /// # Errors
    ///
    /// The light does not read as light.
    #[wasm_bindgen(js_name = setLight)]
    pub fn set_light(&mut self, light: &str, now: f64) -> Result<(), JsError> {
        let light: Light = serde_json::from_str(light).map_err(unread)?;
        self.stage.set_light(&light, now);
        Ok(())
    }

    /// What lies under a point of the canvas, the topmost first: each by the
    /// number of its marked group, or -1 for a shape that stands in none.
    pub fn pick(&mut self, x: f64, y: f64) -> Vec<i32> {
        self.stage.pick(x, y)
    }

    /// Change the size of the canvas, in pixels.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.stage.set_size((f64::from(width), f64::from(height)));
        match &mut self.target {
            Target::Gpu(target) => target.resize(width, height),
            Target::Cpu { canvas, .. } => **canvas = cpu_canvas(width, height),
        }
    }

    /// Draw the frame of a moment, in milliseconds, and say whether the next
    /// moment will look different.
    ///
    /// # Errors
    ///
    /// The surface refused the frame.
    pub fn frame(&mut self, now: f64) -> Result<bool, JsError> {
        match &mut self.target {
            Target::Gpu(target) => {
                let changing = self.stage.draw(target.begin(), now);
                target.finish()?;
                Ok(changing)
            }
            Target::Cpu { canvas, context } => {
                canvas.begin();
                let changing = self.stage.draw(&mut **canvas, now);
                let width = canvas.width();
                let image = ImageData::new_with_u8_clamped_array(Clamped(canvas.finish()), width)
                    .map_err(|error| refused(&error))?;
                context
                    .put_image_data(&image, 0.0, 0.0)
                    .map_err(|error| refused(&error))?;
                Ok(changing)
            }
        }
    }
}

/// A CPU canvas of a size a page can ask for.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a canvas's sides stay far under 65536"
)]
fn cpu_canvas(width: u32, height: u32) -> CpuCanvas {
    CpuCanvas::new(width as u16, height as u16)
}

/// The hash of the core sources this build was made from, as
/// `scripts/build-core.ts` recorded it.
#[wasm_bindgen(js_name = sourceHash)]
#[expect(
    unreachable_pub,
    reason = "wasm-bindgen exports only a public function"
)]
pub fn source_hash() -> String {
    option_env!("ARCHBOARD_CORE_SOURCE_HASH")
        .unwrap_or("unrecorded")
        .to_owned()
}
