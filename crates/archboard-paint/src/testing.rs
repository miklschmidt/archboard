//! What the painter's tests share: a painting of a plain white page, the
//! shapes, strokes and groups the tests draw on it, built from the scene's
//! types, a canvas that records what a frame draws, and a stage to draw with.

use std::collections::BTreeMap;

use archboard_geometry::{Point, Rect};
use archboard_scene::drawing::{DiagramFont, FontFamily};
use archboard_scene::scene::{
    Atlas, Colour, Geometry, GlyphPlace, Group, Item, Paint, Painting, PathStep, Purpose, Role,
    Scene, Shape, Stroke, Subject, Text,
};
use archboard_text::Face;
use kurbo::{Affine, BezPath, Shape as _, Vec2};
use peniko::Color;

use crate::between::PHASES;
use crate::canvas::{Canvas, Ink, Layer, Lens};
use crate::palette::Theme;
use crate::presentation::{Camera, FarLine, Presentation, Timed};
use crate::stage::{Arrival, Motion, Pace, Stage, Surface};

/// A run of words in a sans face, regular or medium, at twelve units, its
/// baseline starting at a point, shaped by the core's own text as Painting
/// sets words.
pub(crate) fn words_at(at: Point, medium: bool, words: &str) -> Text {
    let (face, weight) = if medium {
        (Face::SansMedium, 500)
    } else {
        (Face::SansRegular, 400)
    };
    let size = 12.0;
    Text {
        at,
        font: DiagramFont {
            family: FontFamily::Sans,
            weight,
        },
        size,
        fill: Colour::Black,
        width: archboard_text::width(face, words, size),
        units_per_em: face.units_per_em(),
        glyphs: archboard_text::shape(face, words)
            .glyphs
            .iter()
            .map(|glyph| GlyphPlace {
                face: glyph.face,
                id: glyph.id,
                x: glyph.x,
                y: glyph.y,
            })
            .collect(),
        words: words.to_owned(),
    }
}

/// A 400 by 400 white page that draws this body and has no icons.
pub(crate) fn painting(body: Vec<Item>) -> Painting {
    Painting {
        scene: Scene {
            width: 400.0,
            height: 400.0,
            title: String::new(),
            description: None,
            reading: None,
            background: Colour::White,
            definitions: Vec::new(),
            body,
            atlas: Atlas::default(),
            placed: Vec::new(),
        },
        icons: BTreeMap::new(),
    }
}

/// A shape of some purpose and geometry, painted with nothing.
pub(crate) fn shape(purpose: Purpose, geometry: Geometry) -> Shape {
    Shape {
        purpose,
        geometry,
        fill: None,
        fill_opacity: None,
        stroke: None,
        pointer: None,
        clip: None,
        marker: None,
        start_marker: None,
        members: Vec::new(),
    }
}

/// A box of some purpose, its corners rounded by a radius when it has one, painted with nothing.
pub(crate) fn boxed(purpose: Purpose, rect: Rect, radius: Option<f64>) -> Shape {
    shape(purpose, Geometry::Rect { rect, radius })
}

/// A box of some purpose, its corners square, filled with some paint.
pub(crate) fn filled(purpose: Purpose, rect: Rect, paint: impl Into<Paint>) -> Shape {
    Shape {
        fill: Some(paint.into()),
        ..boxed(purpose, rect, None)
    }
}

/// A route of some purpose drawn as a stroke alone.
pub(crate) fn traced(purpose: Purpose, steps: Vec<PathStep>, stroke: Stroke) -> Shape {
    Shape {
        fill: Some(Paint::None),
        stroke: Some(stroke),
        ..shape(purpose, Geometry::Path { steps })
    }
}

/// A stroke of some paint and width, its ends and corners as the painter's default.
pub(crate) fn stroke(paint: impl Into<Paint>, width: f64) -> Stroke {
    Stroke {
        paint: paint.into(),
        width: Some(width),
        opacity: None,
        cap: None,
        join: None,
        dashes: Vec::new(),
        dash_offset: None,
    }
}

/// A group of some role that draws a subject.
pub(crate) fn subject_group(role: Role, items: Vec<Item>, subject: Subject) -> Group {
    Group {
        subject: Some(subject),
        ..Group::new(role, items)
    }
}

/// One thing a frame drew.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Op {
    /// Whether it was stroked, not filled.
    pub(crate) stroked: bool,
    /// The left edge of what is drawn.
    pub(crate) x: f64,
    /// Where the drawing stands, in canvas pixels.
    pub(crate) at: Vec2,
    /// A stroke's width, or a fill's opacity.
    pub(crate) size: f64,
    /// How solid its ink is.
    pub(crate) solid: f64,
    /// How much of it shows through the layers it is drawn on, from 0 to 1.
    pub(crate) shows: f64,
}

/// How solid an ink is.
fn solid_of(ink: &Ink) -> f64 {
    match ink {
        Ink::Solid(colour) => f64::from(colour.components[3]),
        Ink::Gradient(..) => 1.0,
    }
}

/// A canvas that records what it is asked to draw: each shape, how many layers
/// start, and the lens the frame is seen through.
#[derive(Debug, Default)]
pub(crate) struct Record {
    at: Affine,
    /// The shapes, in the order they were drawn.
    pub(crate) ops: Vec<Op>,
    /// The layers that were started.
    pub(crate) layers: usize,
    /// The opacity of each layer that is open, the innermost last.
    open: Vec<f64>,
    /// The lens the frame is seen through, if any.
    pub(crate) lens: Option<Lens>,
}

impl Record {
    /// Note one shape.
    fn note(&mut self, path: &BezPath, stroked: bool, size: f64, ink: &Ink) {
        self.ops.push(Op {
            stroked,
            x: path.bounding_box().x0,
            at: self.at.translation(),
            size,
            solid: solid_of(ink),
            shows: self.open.iter().product(),
        });
    }

    /// Whether every layer that started has ended.
    pub(crate) fn balanced(&self) -> bool {
        self.open.is_empty()
    }
}

impl Canvas for Record {
    fn set_transform(&mut self, transform: Affine) {
        self.at = transform;
    }
    fn fill(&mut self, path: &BezPath, ink: &Ink, _: bool) {
        self.note(path, false, solid_of(ink), ink);
    }
    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        self.note(path, true, stroke.width, ink);
    }
    fn push(&mut self, layer: Layer<'_>) {
        self.layers += 1;
        self.open.push(match layer {
            Layer::Over { opacity, .. } => f64::from(opacity),
            Layer::Cut | Layer::Keep => 1.0,
        });
    }
    fn pop(&mut self) {
        self.open.pop();
    }
    fn look_through(&mut self, lens: Lens, _: Color) {
        self.lens = Some(lens);
    }
}

/// A stage of a size in canvas pixels, on the light theme, that flies with the
/// tests' phases and loses no stall.
pub(crate) fn stage(size: (f64, f64)) -> Stage {
    let pace = Pace {
        phases: Some(PHASES),
        longest_step: None,
    };
    Stage::new(Theme::Light, size, pace)
}

/// A stage of a size that shows a picture at once.
pub(crate) fn showing(size: (f64, f64), body: Vec<Item>) -> Stage {
    let mut stage = stage(size);
    stage.arrive(painting(body), Arrival::Cut);
    stage
}

/// What a stage draws at a moment, whole, and what moves after it.
pub(crate) fn frame(stage: &mut Stage, now: f64) -> (Record, Motion) {
    let mut record = Record::default();
    let motion = stage.draw(Surface::Direct(&mut record), now);
    (record, motion)
}

/// The page moving the camera from a moment, over a time.
pub(crate) fn camera(to: Camera, ms: f64, at: f64) -> Presentation {
    Presentation {
        camera: Some(Timed { to, ms, at }),
        ..Presentation::default()
    }
}

/// The page saying where the far view begins.
pub(crate) fn far_line(scale: f64, ms: f64) -> Presentation {
    Presentation {
        far_line: Some(FarLine { scale, ms }),
        ..Presentation::default()
    }
}
