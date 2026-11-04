//! Spike: Vello GPU (sparse strips) on WebGL2. The CPU makes the strips of
//! each path, and a WebGL2 fragment pass fills and composes them. It runs the
//! same `Canvas` contract as Vello on WebGPU and on the CPU (ADR 0071).

use archboard_paint::canvas::{Canvas, Ink};
use kurbo::{Affine, BezPath};
use peniko::{BlendMode, Color, Compose, Fill, Mix};
use vello_gpu::{RenderSize, Resources, Scene, WebGlRenderer, WebGlTextureBindings};
use wasm_bindgen::JsError;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext};

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
    canvas: WebGlCanvas,
    size: (u16, u16),
}

/// A WebGL refusal as an error.
#[expect(
    clippy::needless_pass_by_value,
    reason = "this is the shape map_err asks for"
)]
fn refused(error: vello_gpu::WebGlError) -> JsError {
    JsError::new(&format!("WebGL refused: {error:?}"))
}

/// A side of a canvas as the renderer counts it.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a canvas's sides stay far under 65536"
)]
fn side(pixels: u32) -> u16 {
    pixels as u16
}

impl WebGlTarget {
    /// Start Vello GPU on a canvas's WebGL2 context. It refuses a software
    /// rasterizer, because it asks for `failIfMajorPerformanceCaveat`.
    pub(crate) fn start(canvas: &HtmlCanvasElement) -> Result<WebGlTarget, JsError> {
        let size = (side(canvas.width()), side(canvas.height()));
        let (renderer, resources) = WebGlRenderer::new(canvas).map_err(refused)?;
        Ok(WebGlTarget {
            renderer,
            resources,
            canvas: WebGlCanvas {
                scene: Scene::new(size.0, size.1),
            },
            size,
        })
    }

    /// Change the size of the canvas, in pixels.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.size = (side(width), side(height));
        self.canvas.scene.reset_and_resize(self.size.0, self.size.1);
    }

    /// The canvas of the next frame, empty.
    pub(crate) fn begin(&mut self) -> &mut WebGlCanvas {
        self.canvas.scene.reset();
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
                &self.canvas.scene,
                &mut self.resources,
                &size,
                &WebGlTextureBindings::new(),
                Color::TRANSPARENT,
            )
            .map_err(refused)
    }

    /// Wait for the GPU to finish the frame: read one pixel back. Only a
    /// measurement asks for this.
    pub(crate) fn wait(&self) {
        let gl: &WebGl2RenderingContext = self.renderer.gl_context();
        let mut pixel = [0_u8; 4];
        gl.read_pixels_with_opt_u8_array(
            0,
            0,
            1,
            1,
            WebGl2RenderingContext::RGBA,
            WebGl2RenderingContext::UNSIGNED_BYTE,
            Some(&mut pixel),
        )
        .ok();
    }
}
