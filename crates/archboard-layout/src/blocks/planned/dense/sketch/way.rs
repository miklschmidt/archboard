//! What stands in a line's way while only the line's own ends move, as the door ring moves a door
//! round the frames: the solid boxes and the foreign frames.
//!
//! The ring weighs a line at every place of its door against the same solid boxes, so each box
//! keeps the edges that `Sketch::round` and `rounds` test it by, each made once with the same
//! operations. The sums are then the ones that `rounds` makes.

use crate::geometry::{Point, Rect};

use super::{BEND, Scene, Sketch, TOUCH, rounds};

/// A solid box by the edges that a sketch is tested against: its own, and each moved in or out
/// by the room that keeps a touch apart.
#[derive(Clone, Copy, Debug)]
struct Solid {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
    /// Its edges moved in.
    inner: [f64; 4],
    /// Its right and bottom edges moved out.
    outer: Point,
}

impl Solid {
    fn new(at: Rect) -> Solid {
        let (right, bottom) = (at.x + at.width, at.y + at.height);
        Solid {
            left: at.x,
            top: at.y,
            right,
            bottom,
            inner: [at.x + TOUCH, at.y + TOUCH, right - TOUCH, bottom - TOUCH],
            outer: Point {
                x: right + TOUCH,
                y: bottom + TOUCH,
            },
        }
    }
}

/// A segment of a sketch, as it runs through boxes: whether it runs down, the place across its
/// course where it stands, and where along its course it starts and ends.
#[derive(Clone, Copy, Debug)]
struct Run {
    upright: bool,
    along: f64,
    low: f64,
    high: f64,
}

impl Run {
    fn new((a, b): (Point, Point)) -> Run {
        if a.x == b.x {
            Run {
                upright: true,
                along: a.x,
                low: a.y.min(b.y),
                high: a.y.max(b.y),
            }
        } else {
            Run {
                upright: false,
                along: a.y,
                low: a.x.min(b.x),
                high: a.x.max(b.x),
            }
        }
    }

    /// What the segment adds to go round a box, as `Sketch::round` weighs it.
    fn round(&self, solid: &Solid) -> f64 {
        let [left, top, right, bottom] = solid.inner;
        let Run {
            upright,
            along,
            low,
            high,
        } = *self;
        let (across, ahead, near, far) = if upright {
            ((left, right), (top, bottom), solid.left, solid.right)
        } else {
            ((top, bottom), (left, right), solid.top, solid.bottom)
        };
        let through = along > across.0 && along < across.1 && low < ahead.1 && high > ahead.0;
        if through {
            2.0 * (along - near).min(far - along) + 2.0 * BEND
        } else {
            0.0
        }
    }
}

/// A line's way, as it runs through boxes: the box round it, and its segments.
#[derive(Clone, Copy, Debug)]
struct Way {
    low: Point,
    /// The far sides of the box round it, moved out by the room that keeps a touch apart.
    outer: Point,
    runs: [Run; 2],
    bent: bool,
}

impl Way {
    fn new(sketch: &Sketch) -> Way {
        let span = sketch.span;
        // A straight sketch's second segment stands still at its end, and nothing weighs it.
        let points = sketch.points;
        Way {
            low: Point {
                x: span.x,
                y: span.y,
            },
            outer: Point {
                x: span.x + span.width + TOUCH,
                y: span.y + span.height + TOUCH,
            },
            runs: [0, 1].map(|at| Run::new((points[at], points[at + 1]))),
            bent: sketch.bent,
        }
    }

    /// What the way adds to go round a box, as `Sketch::round` weighs it.
    fn round(&self, solid: &Solid) -> f64 {
        let meets = self.low.x < solid.outer.x
            && solid.left < self.outer.x
            && self.low.y < solid.outer.y
            && solid.top < self.outer.y;
        if !meets {
            return 0.0;
        }
        let first = self.runs[0].round(solid);
        if self.bent {
            first + self.runs[1].round(solid)
        } else {
            first
        }
    }
}

/// The solid boxes and the foreign frames that a line's sketches go round, each in the scene's
/// order.
pub(in crate::blocks::planned::dense) struct InTheWay {
    solid: Vec<Solid>,
    frames: Vec<Rect>,
}

impl InTheWay {
    /// What a way adds to go round the solid boxes, as `rounds` sums it. A box that the way's
    /// box does not meet adds nothing.
    fn round(&self, way: &Sketch) -> f64 {
        let way = Way::new(way);
        let mut added = 0.0;
        for solid in &self.solid {
            added += way.round(solid);
        }
        added
    }
}

impl Scene {
    /// The solid boxes and the foreign frames that a line can run through, in the scene's order.
    /// They stay while only the line's own ends move.
    pub(in crate::blocks::planned::dense) fn in_the_way(&self, line: usize) -> InTheWay {
        let solid = (self.boxes.iter().enumerate())
            .filter(|&(at, _)| self.blocks(line, at))
            .map(|(_, &at)| Solid::new(at));
        let frames = (self.frames.iter().enumerate())
            .filter(|&(frame, _)| self.foreign(line, frame))
            .map(|(_, &at)| at);
        InTheWay {
            solid: solid.collect(),
            frames: frames.collect(),
        }
    }

    /// What a line costs among the boxes that stand in its way, solid boxes and foreign frames:
    /// what its cheapest sketch costs.
    ///
    /// A way costs no less than it does with no solid box in its way, so the way that costs less
    /// so goes round the solid boxes first, and the other only where it could cost less still.
    pub(in crate::blocks::planned::dense) fn cost_among(&self, line: usize, way: &InTheWay) -> f64 {
        let ways = self.ways(line);
        let frames = rounds(&ways, way.frames.iter().copied());
        let against = self.against(line);
        let cost = |at: usize, solid: f64| {
            let sketch: &Sketch = ways[at].as_ref().expect("a line's way");
            sketch.cost(solid + frames[at], against)
        };
        let round = |at: usize| way.round(ways[at].as_ref().expect("a line's way"));
        if ways[1].is_none() {
            return cost(0, round(0));
        }
        let least = [cost(0, 0.0), cost(1, 0.0)];
        let (first, second) = if least[1] < least[0] { (1, 0) } else { (0, 1) };
        let found = cost(first, round(first));
        if least[second] >= found {
            return found;
        }
        let other = cost(second, round(second));
        if other.total_cmp(&found).is_lt() {
            other
        } else {
            found
        }
    }
}
