//! Vello on the CPU: the painter of a machine with no usable WebGPU, of the
//! frame-by-frame recordings, and of every test (ADR 0071).

use kurbo::{Affine, BezPath};
use peniko::{BlendMode, Compose, Fill, Mix};
use vello_cpu::{Pixmap, RenderContext, Resources};

use crate::canvas::{Canvas, Ink};

/// A canvas that rasterizes on this thread.
#[derive(Debug)]
pub struct CpuCanvas {
    context: RenderContext,
    resources: Resources,
    pixmap: Pixmap,
}

impl CpuCanvas {
    /// A canvas of a size in pixels.
    pub fn new(width: u16, height: u16) -> CpuCanvas {
        CpuCanvas {
            context: RenderContext::new(width, height),
            resources: Resources::new(),
            pixmap: Pixmap::new(width, height),
        }
    }

    /// How wide the canvas is, in pixels.
    pub fn width(&self) -> u32 {
        u32::from(self.pixmap.width())
    }

    /// Forget the last frame.
    pub fn begin(&mut self) {
        self.context.reset();
    }

    /// Rasterize the frame, and answer its pixels, four premultiplied bytes each.
    pub fn finish(&mut self) -> &[u8] {
        self.context.flush();
        self.context.render(&mut self.pixmap, &mut self.resources);
        self.pixmap.data_as_u8_slice()
    }

    /// Set the ink of the next shape.
    fn ink(&mut self, ink: &Ink) {
        match ink {
            Ink::Solid(colour) => {
                self.context.set_paint(*colour);
                self.context.reset_paint_transform();
            }
            Ink::Gradient(gradient, transform) => {
                self.context.set_paint(gradient.clone());
                self.context.set_paint_transform(*transform);
            }
        }
    }
}

impl Canvas for CpuCanvas {
    fn set_transform(&mut self, transform: Affine) {
        self.context.set_transform(transform);
    }

    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        self.ink(ink);
        self.context.set_fill_rule(if even_odd {
            Fill::EvenOdd
        } else {
            Fill::NonZero
        });
        self.context.fill_path(path);
    }

    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        self.ink(ink);
        self.context.set_stroke(stroke.clone());
        self.context.stroke_path(path);
    }

    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32) {
        self.context.set_fill_rule(match clip {
            Some((_, true)) => Fill::EvenOdd,
            _ => Fill::NonZero,
        });
        self.context
            .push_layer(clip.map(|(path, _)| path), None, Some(opacity), None, None);
    }

    fn push_cut(&mut self) {
        let cut = BlendMode::new(Mix::Normal, Compose::DestOut);
        self.context.push_layer(None, Some(cut), None, None, None);
    }

    fn push_keep(&mut self) {
        let keep = BlendMode::new(Mix::Normal, Compose::DestIn);
        self.context.push_layer(None, Some(keep), None, None, None);
    }

    fn pop(&mut self) {
        self.context.pop_layer();
    }
}
