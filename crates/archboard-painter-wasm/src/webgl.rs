//! Vello GPU on WebGL2, the painter of a page with no usable WebGPU (ADR 0074).
//! This thread cuts each path into sparse strips, and a WebGL2 fragment pass
//! fills and composes them. It draws the same `Canvas` calls as Vello on the
//! CPU, and it keeps its parts as the CPU canvas does.

use std::cell::OnceCell;

use archboard_paint::canvas::{Canvas, Ink};
use archboard_paint::parts::Keeper;
use kurbo::{Affine, BezPath};
use peniko::{BlendMode, Color, Compose, Fill, Mix};
use vello_gpu::{RenderSize, Resources, Scene, WebGlRenderer, WebGlTextureBindings};
use wasm_bindgen::{JsCast, JsError, JsValue};
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext, WebglLoseContext};

use crate::software::is_software;

/// The parameter of `WEBGL_debug_renderer_info` that names the renderer itself.
const UNMASKED_RENDERER_WEBGL: u32 = 0x9246;

/// One frame's drawing, as strips made on this thread.
pub(crate) struct WebGlCanvas {
    scene: Scene,
}

impl WebGlCanvas {
    /// Set the ink of the next shape.
    fn ink(&mut self, ink: &Ink) {
        match ink {
            Ink::Solid(colour) => {
                self.scene.set_paint(*colour);
                self.scene.reset_paint_transform();
            }
            Ink::Gradient(gradient, transform) => {
                self.scene.set_paint(gradient.clone());
                self.scene.set_paint_transform(*transform);
            }
        }
    }
}

impl Canvas for WebGlCanvas {
    fn set_transform(&mut self, transform: Affine) {
        self.scene.set_transform(transform);
    }

    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        self.ink(ink);
        self.scene.set_fill_rule(if even_odd {
            Fill::EvenOdd
        } else {
            Fill::NonZero
        });
        self.scene.fill_path(path);
    }

    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        self.ink(ink);
        self.scene.set_stroke(stroke.clone());
        self.scene.stroke_path(path);
    }

    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32) {
        self.scene.set_fill_rule(match clip {
            Some((_, true)) => Fill::EvenOdd,
            _ => Fill::NonZero,
        });
        self.scene
            .push_layer(clip.map(|(path, _)| path), None, Some(opacity), None, None);
    }

    fn push_cut(&mut self) {
        let cut = BlendMode::new(Mix::Normal, Compose::DestOut);
        self.scene.push_layer(None, Some(cut), None, None, None);
    }

    fn push_keep(&mut self) {
        let keep = BlendMode::new(Mix::Normal, Compose::DestIn);
        self.scene.push_layer(None, Some(keep), None, None, None);
    }

    fn pop(&mut self) {
        self.scene.pop_layer();
    }
}

/// A WebGL2 canvas and all that draws on it.
pub(crate) struct WebGlTarget {
    renderer: WebGlRenderer,
    resources: Resources,
    canvas: Keeper<WebGlCanvas>,
    size: (u16, u16),
}

/// A WebGL refusal as an error.
#[expect(
    clippy::needless_pass_by_value,
    reason = "this is the shape map_err asks for"
)]
fn refused(error: vello_gpu::WebGlError) -> JsError {
    JsError::new(&format!("WebGL2 refused: {error}"))
}

/// A side of a canvas as the renderer counts it.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a canvas's sides stay far under 65536"
)]
fn side(pixels: u32) -> u16 {
    pixels as u16
}

/// A frame's drawing, empty, at a size in pixels.
fn drawing_of(size: (u16, u16)) -> WebGlCanvas {
    WebGlCanvas {
        scene: Scene::new(size.0, size.1),
    }
}

thread_local! {
    /// The page's WebGL2 renderer when it draws in software, once a probe read it.
    static SOFTWARE: OnceCell<Option<String>> = const { OnceCell::new() };
}

/// The name of this page's WebGL2 renderer, when it draws in software. A
/// browser can give a software renderer with no performance caveat: Chrome
/// gives `SwiftShader` so, and Firefox never reports the caveat. The page reads
/// it once, so that a refusal gives no canvas a context and compiles no shader.
fn software_renderer() -> Option<String> {
    SOFTWARE.with(|software| software.get_or_init(probe).clone())
}

/// Read the renderer's name from a context on a scratch canvas, and let the
/// context go. No answer lets the canvas's own start decide.
fn probe() -> Option<String> {
    let gl = scratch_context()?;
    let name = renderer_name(&gl);
    if let Some(lose) = gl.get_extension("WEBGL_lose_context").ok().flatten() {
        lose.unchecked_into::<WebglLoseContext>().lose_context();
    }
    name.filter(|name| is_software(name))
}

/// A WebGL2 context on a canvas that no page shows, asked for as Vello GPU asks:
/// with no major performance caveat.
fn scratch_context() -> Option<WebGl2RenderingContext> {
    let scratch = web_sys::window()?
        .document()?
        .create_element("canvas")
        .ok()?
        .dyn_into::<HtmlCanvasElement>()
        .ok()?;
    let options = js_sys::Object::new();
    js_sys::Reflect::set(
        &options,
        &"failIfMajorPerformanceCaveat".into(),
        &JsValue::TRUE,
    )
    .ok()?;
    scratch
        .get_context_with_context_options("webgl2", &options)
        .ok()
        .flatten()?
        .dyn_into::<WebGl2RenderingContext>()
        .ok()
}

/// The name of a context's renderer: its unmasked name where the browser gives
/// it, and its plain name otherwise.
fn renderer_name(gl: &WebGl2RenderingContext) -> Option<String> {
    let unmasked = gl
        .get_extension("WEBGL_debug_renderer_info")
        .ok()
        .flatten()
        .is_some();
    gl.get_parameter(if unmasked {
        UNMASKED_RENDERER_WEBGL
    } else {
        WebGl2RenderingContext::RENDERER
    })
    .ok()?
    .as_string()
}

impl WebGlTarget {
    /// Start Vello GPU on a canvas's WebGL2 context. It refuses a software
    /// renderer before the canvas takes a context, and a context with a major
    /// performance caveat.
    pub(crate) fn start(canvas: &HtmlCanvasElement) -> Result<WebGlTarget, JsError> {
        if let Some(name) = software_renderer() {
            return Err(JsError::new(&format!("WebGL2 draws in software: {name}.")));
        }
        let size = (side(canvas.width()), side(canvas.height()));
        let (starting, resources) = WebGlRenderer::begin(canvas).map_err(refused)?;
        Ok(WebGlTarget {
            renderer: starting.finish().map_err(refused)?,
            resources,
            canvas: Keeper::new(drawing_of(size), (f64::from(size.0), f64::from(size.1))),
            size,
        })
    }

    /// Change the size of the canvas, in pixels.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.size = (side(width), side(height));
        self.canvas
            .replace(drawing_of(self.size), (f64::from(width), f64::from(height)));
    }

    /// The canvas of the next frame, empty.
    pub(crate) fn begin(&mut self) -> &mut Keeper<WebGlCanvas> {
        self.canvas.canvas().scene.reset();
        &mut self.canvas
    }

    /// Fill and compose the strips on the GPU.
    pub(crate) fn finish(&mut self) -> Result<(), JsError> {
        let size = RenderSize {
            width: self.size.0,
            height: self.size.1,
        };
        self.renderer
            .render(
                &self.canvas.canvas().scene,
                &mut self.resources,
                &size,
                &WebGlTextureBindings::new(),
                Color::TRANSPARENT,
            )
            .map_err(refused)
    }
}
