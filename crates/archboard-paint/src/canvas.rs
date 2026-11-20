//! What a painter draws on. The draw walk knows this contract and no renderer,
//! so that Vello on a GPU and Vello on the CPU draw one picture.

use archboard_geometry::Rect;
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

/// What a retained part of a frame is known by.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PartKey {
    /// One item in one settled look, numbered across the whole picture.
    Item {
        /// The look the item belongs to.
        look: u64,
        /// The item's number in the walk.
        index: usize,
    },
    /// A shaped run of words, independent of the picture it occurs in.
    Text(u64),
}

/// The box a lens keeps in focus, in canvas pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Focus {
    /// Where the box stands.
    pub place: Rect,
    /// How round its corners are.
    pub radius: f64,
    /// How far past its edge the focus goes.
    pub soft: f64,
}

/// How a frame in motion is seen.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lens {
    /// What stays in focus. With no box, nothing does.
    pub focus: Option<Focus>,
    /// How far out of focus the rest is, as a blur in canvas pixels.
    pub blur: f64,
    /// How far the rest has sunk into the ground, from 0 to 1.
    pub sink: f64,
    /// How far the frame smears across as it travels, in canvas pixels.
    pub smear: f64,
}

/// A layer a canvas starts: what follows lands on it until the layer ends.
#[derive(Clone, Copy, Debug)]
pub enum Layer<'a> {
    /// A layer laid over the one under it, clipped to a path when there is one
    /// (filled even-odd when its flag says so), at an opacity.
    Over {
        /// The path the layer is clipped to, and whether it fills even-odd.
        clip: Option<(&'a BezPath, bool)>,
        /// How opaque the layer lands, from 0 to 1.
        opacity: f32,
    },
    /// A layer that removes what it covers from the layer under it. A
    /// picture's masks are cuts in a white ground, so a cut is all they need.
    Cut,
    /// A layer that keeps of the layer under it only what it covers.
    Keep,
}

/// A surface that takes one frame's drawing.
pub trait Canvas {
    /// Set the transform of everything drawn from now on.
    fn set_transform(&mut self, transform: Affine);
    /// Fill a path.
    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool);
    /// Stroke a path.
    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink);
    /// Start a layer. A clipped layer is clipped under the transform that stands.
    fn push(&mut self, layer: Layer<'_>);
    /// End the last layer.
    fn pop(&mut self);
    /// Draw again what is kept under a key, under a transform. A canvas that
    /// holds nothing under the key answers false.
    fn again(&mut self, _key: PartKey, _transform: Affine) -> bool {
        false
    }
    /// Start keeping what is drawn from now on, in its own space. A canvas that
    /// keeps nothing answers false and goes on as before.
    fn keep(&mut self) -> bool {
        false
    }
    /// End what [`Canvas::keep`] started: keep it under a key, and draw it
    /// under a transform.
    fn kept(&mut self, _key: PartKey, _transform: Affine) {}
    /// See this frame through a lens, the picture sinking into a ground. A canvas
    /// with no lens shows the frame as drawn.
    fn look_through(&mut self, _lens: Lens, _ground: Color) {}
}
