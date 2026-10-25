//! A glyph's outline, drawn by Skrifa unhinted in the units of its face.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use skrifa::{DrawMemory, GlyphId, PathSink, ScalerFont};

use crate::faces::Face;

/// One step of a glyph's outline, in the units of its face, y growing down
/// as it does on the page.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Segment {
    /// Start a new contour at a point.
    Move(f64, f64),
    /// A straight line to a point.
    Line(f64, f64),
    /// A quadratic curve by a control point to a point.
    Quad(f64, f64, f64, f64),
    /// A cubic curve by two control points to a point.
    Cubic(f64, f64, f64, f64, f64, f64),
    /// Close the contour.
    Close,
}

/// The outline drawn as steps, y turned to grow down.
#[derive(Debug, Default)]
struct Steps(Vec<Segment>);

impl PathSink for Steps {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.push(Segment::Move(f64::from(x), -f64::from(y)));
    }

    fn line_to(&mut self, x: f32, y: f32) {
        self.0.push(Segment::Line(f64::from(x), -f64::from(y)));
    }

    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        self.0.push(Segment::Quad(
            f64::from(cx0),
            -f64::from(cy0),
            f64::from(x),
            -f64::from(y),
        ));
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        self.0.push(Segment::Cubic(
            f64::from(cx0),
            -f64::from(cy0),
            f64::from(cx1),
            -f64::from(cy1),
            f64::from(x),
            -f64::from(y),
        ));
    }

    fn close(&mut self) {
        self.0.push(Segment::Close);
    }
}

/// The outlines drawn so far, by face and glyph.
type Drawn = HashMap<(Face, u32), Rc<[Segment]>>;

/// A glyph's outline in its face, unhinted: none for a glyph that draws
/// nothing, such as a space. Each is drawn once, then read again.
pub fn outline(face: Face, glyph: u32) -> Rc<[Segment]> {
    thread_local! {
        static SCALERS: [ScalerFont; 8] = Face::ALL.map(|face| ScalerFont::force_unhinted(face.font().clone(), None));
        static DRAWN: RefCell<Drawn> = RefCell::new(HashMap::new());
    }
    if let Some(known) = DRAWN.with(|drawn| drawn.borrow().get(&(face, glyph)).cloned()) {
        return known;
    }
    let steps: Rc<[Segment]> = SCALERS
        .with(|scalers| {
            let mut steps = Steps::default();
            if let Some(drawn) = scalers[face as usize].outline(GlyphId::new(glyph)) {
                // A bundled glyph always draws: a failed draw leaves the glyph blank.
                if drawn.draw(DrawMemory::Scratch, &mut steps).is_err() {
                    return Vec::new();
                }
            }
            steps.0
        })
        .into();
    DRAWN.with(|drawn| drawn.borrow_mut().insert((face, glyph), Rc::clone(&steps)));
    steps
}
