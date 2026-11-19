//! The painter a page holds: one stage, and the surface its frames land on.

use archboard_paint::{
    Arrival, Camera, Canvas, CpuCanvas, Departure, Ink, Layer, Motion, Pace, Presentation, Stage,
    Surface, Theme, Timed,
};
use archboard_scene::scene::Painting;
use kurbo::{Affine, BezPath};
use wasm_bindgen::prelude::*;
use wasm_bindgen::{Clamped, JsCast};
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

use crate::gpu::{GpuTarget, warm};
use crate::webgl::WebGlTarget;

/// Where a frame lands.
enum Target {
    Gpu(Box<GpuTarget>),
    WebGl(Box<WebGlTarget>),
    Cpu {
        canvas: Box<CpuCanvas>,
        /// How wide the canvas is, in pixels.
        width: u32,
        context: CanvasRenderingContext2d,
    },
}

/// What the frames after a frame show, as a page reads it.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub enum FrameMotion {
    /// Nothing moves: the next frame looks as this one does.
    Still = "still",
    /// Only the traffic moves.
    TrafficAlone = "trafficAlone",
    /// The picture or how it is seen moves.
    Moving = "moving",
}

impl From<Motion> for FrameMotion {
    fn from(motion: Motion) -> FrameMotion {
        match motion {
            Motion::Still => FrameMotion::Still,
            Motion::TrafficAlone => FrameMotion::TrafficAlone,
            Motion::Moving => FrameMotion::Moving,
        }
    }
}

/// A canvas that only counts what a frame draws, for a measurement to name its picture.
#[derive(Default)]
struct Count {
    fills: u32,
    strokes: u32,
    layers: u32,
}

impl Canvas for Count {
    fn set_transform(&mut self, _: Affine) {}
    fn fill(&mut self, _: &BezPath, _: &Ink, _: bool) {
        self.fills += 1;
    }
    fn stroke(&mut self, _: &BezPath, _: &kurbo::Stroke, _: &Ink) {
        self.strokes += 1;
    }
    fn push(&mut self, _: Layer<'_>) {
        self.layers += 1;
    }
    fn pop(&mut self) {}
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

/// A stage of a canvas's size, its pace read from JSON.
fn stage_of(dark: bool, size: (u32, u32), pace: &str) -> Result<Stage, JsError> {
    let pace: Pace = serde_json::from_str(pace).map_err(unread)?;
    let size = (f64::from(size.0), f64::from(size.1));
    Ok(Stage::new(theme_of(dark), size, pace))
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
    /// How long the last frame took to draw on its canvas and to render, in
    /// milliseconds.
    times: [f64; 2],
}

/// The page's clock, in milliseconds.
fn clock_now() -> f64 {
    web_sys::window()
        .and_then(|window| window.performance())
        .map_or(0.0, |performance| performance.now())
}

#[wasm_bindgen]
impl Painter {
    /// Start the GPU of this page, ready for its canvases. It ends when the GPU
    /// finished a first frame, and `stopped` hears why the GPU stopped, if it does.
    ///
    /// # Errors
    ///
    /// WebGPU gave no adapter or device, or it refused the frame.
    pub async fn warm(stopped: js_sys::Function) -> Result<(), JsError> {
        warm(stopped).await
    }

    /// Start Vello on WebGPU on a canvas, with the GPU of this page. `pace`
    /// says in JSON how the stage keeps time: `{"phases", "longestStep"}`.
    ///
    /// # Errors
    ///
    /// The pace does not read, or the surface refused. A canvas that took a
    /// WebGPU context takes no other, so the page falls back on a new canvas.
    pub fn gpu(canvas: HtmlCanvasElement, dark: bool, pace: &str) -> Result<Painter, JsError> {
        let stage = stage_of(dark, (canvas.width(), canvas.height()), pace)?;
        let target = GpuTarget::start(canvas)?;
        Ok(Painter {
            stage,
            target: Target::Gpu(Box::new(target)),
            times: [0.0; 2],
        })
    }

    /// Start Vello on the CPU on a canvas, its stage keeping a pace in JSON.
    ///
    /// # Errors
    ///
    /// The pace does not read, or the canvas gave no 2D context.
    pub fn cpu(canvas: &HtmlCanvasElement, dark: bool, pace: &str) -> Result<Painter, JsError> {
        let context = canvas
            .get_context("2d")
            .ok()
            .flatten()
            .and_then(|context| context.dyn_into::<CanvasRenderingContext2d>().ok())
            .ok_or_else(|| JsError::new("The canvas gave no 2D context."))?;
        let (width, height) = (canvas.width(), canvas.height());
        Ok(Painter {
            stage: stage_of(dark, (width, height), pace)?,
            target: Target::Cpu {
                canvas: Box::new(cpu_canvas(width, height)),
                width,
                context,
            },
            times: [0.0; 2],
        })
    }

    /// Start Vello GPU on WebGL2 on a canvas, its stage keeping a pace in JSON.
    ///
    /// # Errors
    ///
    /// The pace does not read, or the canvas gave no WebGL2 context, only one
    /// with a major performance caveat, or one that draws in software, or its
    /// shaders did not build. A canvas that took a WebGL2 context takes no 2D
    /// one, so the page falls back on a new canvas.
    pub fn webgl(canvas: &HtmlCanvasElement, dark: bool, pace: &str) -> Result<Painter, JsError> {
        let stage = stage_of(dark, (canvas.width(), canvas.height()), pace)?;
        let target = WebGlTarget::start(canvas)?;
        Ok(Painter {
            stage,
            target: Target::WebGl(Box::new(target)),
            times: [0.0; 2],
        })
    }

    /// How long the last frame took to draw on its canvas and to render, in
    /// milliseconds: what `scripts/painter-bench.ts` reports. Drawing on a
    /// strip canvas cuts the strips.
    #[wasm_bindgen(js_name = lastTimes)]
    pub fn last_times(&self) -> Vec<f64> {
        self.times.to_vec()
    }

    /// What a frame of a moment draws, as fills, strokes and layers, for a
    /// measurement to name its picture. It draws whole, as a canvas that keeps
    /// no parts would.
    #[wasm_bindgen(js_name = countFrame)]
    pub fn count_frame(&mut self, now: f64) -> Vec<u32> {
        let mut count = Count::default();
        self.stage.draw(Surface::Direct(&mut count), now);
        vec![count.fills, count.strokes, count.layers]
    }

    /// Say how the picture is seen, as JSON: each value stated replaces the
    /// last, and a value left out stays. A timed value names the moment of the
    /// page's clock it starts at.
    ///
    /// # Errors
    ///
    /// The presentation does not read as one.
    pub fn present(&mut self, said: &str) -> Result<(), JsError> {
        let said: Presentation = serde_json::from_str(said).map_err(unread)?;
        self.stage.present(said);
        Ok(())
    }

    /// Move the picture on the canvas, in canvas pixels, over a time in
    /// milliseconds from a moment of the page's clock. A glide states it every
    /// frame, so it goes as numbers and not as JSON.
    #[wasm_bindgen(js_name = setCamera)]
    pub fn set_camera(&mut self, x: f64, y: f64, scale: f64, ms: f64, at: f64) {
        self.stage.present(Presentation {
            camera: Some(Timed {
                to: Camera { x, y, scale },
                ms,
                at,
            }),
            ..Presentation::default()
        });
    }

    /// Bring a picture onto the stage: its painting, and how it arrives, both as JSON.
    ///
    /// # Errors
    ///
    /// The painting or the arrival does not read.
    pub fn arrive(&mut self, painting: &str, arrival: &str) -> Result<(), JsError> {
        let painting: Painting = serde_json::from_str(painting).map_err(unread)?;
        let arrival: Arrival = serde_json::from_str(arrival).map_err(unread)?;
        self.stage.arrive(painting, arrival);
        Ok(())
    }

    /// Say what becomes of the picture on the stage, as JSON.
    ///
    /// # Errors
    ///
    /// The departure does not read as one.
    pub fn depart(&mut self, departure: &str) -> Result<(), JsError> {
        let departure: Departure = serde_json::from_str(departure).map_err(unread)?;
        self.stage.depart(departure);
        Ok(())
    }

    /// What lies under a point of the canvas, the topmost first: each by the
    /// number of its marked group, or -1 for a shape that stands in none.
    pub fn pick(&mut self, x: f64, y: f64) -> Vec<i32> {
        self.stage.pick(x, y)
    }

    /// Change the size of the canvas, in pixels.
    pub fn resize(&mut self, width: u32, height: u32) {
        self.stage.present(Presentation {
            size: Some((f64::from(width), f64::from(height))),
            ..Presentation::default()
        });
        match &mut self.target {
            Target::Gpu(target) => target.resize(width, height),
            Target::WebGl(target) => target.resize(width, height),
            Target::Cpu {
                canvas,
                width: wide,
                ..
            } => {
                **canvas = cpu_canvas(width, height);
                *wide = width;
            }
        }
    }

    /// Draw the frame of a moment of the page's clock, in milliseconds, and
    /// say what moves after it.
    ///
    /// # Errors
    ///
    /// The surface refused the frame.
    pub fn frame(&mut self, now: f64) -> Result<FrameMotion, JsError> {
        let started = clock_now();
        let (motion, drawn) = match &mut self.target {
            Target::Gpu(target) => {
                let motion = self.stage.draw(Surface::Direct(target.begin()), now);
                let drawn = clock_now();
                target.finish()?;
                (motion, drawn)
            }
            Target::WebGl(target) => {
                let motion = self.stage.draw(Surface::Strips(target.begin()), now);
                let drawn = clock_now();
                target.finish()?;
                (motion, drawn)
            }
            Target::Cpu {
                canvas,
                width,
                context,
            } => {
                let motion = self.stage.draw(Surface::Strips(&mut **canvas), now);
                let drawn = clock_now();
                let image = ImageData::new_with_u8_clamped_array(Clamped(canvas.pixels()), *width)
                    .map_err(|error| refused(&error))?;
                context
                    .put_image_data(&image, 0.0, 0.0)
                    .map_err(|error| refused(&error))?;
                (motion, drawn)
            }
        };
        self.times = [drawn - started, clock_now() - drawn];
        Ok(motion.into())
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
