//! What a painter draws on. The draw walk knows this contract and no renderer,
//! so that Vello on a GPU and Vello on the CPU draw one picture.

use kurbo::{Affine, BezPath};
use peniko::{Color, Gradient};

/// What a shape is filled or stroked with.
#[derive(Clone, Debug, PartialEq)]
pub enum Ink {
    /// One colour.
    Solid(Color),
    /// A gradient, and where its own unit space lies in the current space.
    Gradient(Gradient, Affine),
}

/// A surface that takes one frame's drawing.
pub trait Canvas {
    /// Set the transform of everything drawn from now on.
    fn set_transform(&mut self, transform: Affine);
    /// Fill a path.
    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool);
    /// Stroke a path.
    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink);
    /// Start a layer: what follows lands on it, clipped and at an opacity.
    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32);
    /// Start a layer that removes what it covers from the layer under it.
    /// A picture's masks are cuts in a white ground, so a cut is all they need.
    fn push_cut(&mut self);
    /// Start a layer that keeps of the layer under it only what it covers.
    fn push_keep(&mut self);
    /// End the last layer.
    fn pop(&mut self);
    /// Draw again what is kept under a key, under a transform. A canvas that
    /// holds nothing under the key answers false.
    fn again(&mut self, _key: u64, _transform: Affine) -> bool {
        false
    }
    /// Start keeping what is drawn from now on, in its own space. A canvas that
    /// keeps nothing answers false and goes on as before.
    fn keep(&mut self) -> bool {
        false
    }
    /// End what [`Canvas::keep`] started: keep it under a key, and draw it
    /// under a transform.
    fn kept(&mut self, _key: u64, _transform: Affine) {}
}

/// A canvas that only counts, for tests of what a frame draws.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Count {
    /// The paths that were filled.
    pub fills: usize,
    /// The paths that were stroked.
    pub strokes: usize,
    /// The layers that were started.
    pub layers: usize,
    /// The layers that are open.
    pub open: usize,
}

impl Canvas for Count {
    fn set_transform(&mut self, _: Affine) {}
    fn fill(&mut self, _: &BezPath, _: &Ink, _: bool) {
        self.fills += 1;
    }
    fn stroke(&mut self, _: &BezPath, _: &kurbo::Stroke, _: &Ink) {
        self.strokes += 1;
    }
    fn push(&mut self, _: Option<(&BezPath, bool)>, _: f32) {
        self.layers += 1;
        self.open += 1;
    }
    fn push_cut(&mut self) {
        self.layers += 1;
        self.open += 1;
    }
    fn push_keep(&mut self) {
        self.layers += 1;
        self.open += 1;
    }
    fn pop(&mut self) {
        self.open -= 1;
    }
}
