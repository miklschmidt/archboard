//! What stands in a line's way while only the line's own ends move, as the door ring moves a door
//! round the frames: the solid boxes and the foreign frames.
//!
//! The ring weighs a line at every place of its door against the same solid boxes, so each box
//! keeps the edges that `Sketch::round` and `rounds` test it by, each made once with the same
//! operations. The sums are then the ones that `rounds` makes.
//!
//! Along one wall of the ring, one way of a line keeps the same segment among the boxes, and
//! its other segment runs beside the ring, past every box. What such a way adds depends on that
//! one segment alone, so the line keeps it for the next place.
//!
//! A segment runs through a box only where it stands strictly within the box's inner edges
//! across its course. So each axis is cut into even stretches, each with the bits of the boxes
//! whose inner edges reach into it, and a way asks only the boxes of its segments' stretches,
//! in the boxes' order.

use std::cell::Cell;

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
    /// Whether two segments are the same, to the last bit.
    fn same(&self, other: &Run) -> bool {
        let bits = |run: &Run| [run.along, run.low, run.high].map(f64::to_bits);
        self.upright == other.upright && bits(self) == bits(other)
    }

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

/// How many even stretches each axis is cut into.
const STRETCHES: usize = 64;

/// The solid boxes by even stretches of one axis: for each stretch, the bits of the boxes whose
/// inner edges reach into it, in the boxes' order, some words to a stretch.
struct Stretches {
    low: f64,
    scale: f64,
    bits: Vec<u64>,
}

impl Stretches {
    /// The stretches of an axis between two ends, for the inner edges of each box along it.
    fn new((low, high): (f64, f64), inner: impl Iterator<Item = (f64, f64)>, words: usize) -> Self {
        let scale = STRETCHES as f64 / (high - low);
        let mut stretches = Stretches {
            low,
            scale: if scale.is_finite() { scale } else { 0.0 },
            bits: vec![0; STRETCHES * words],
        };
        for (at, (first, last)) in inner.enumerate() {
            // A box no wider than its two touches has no segment within it.
            if first < last {
                for stretch in stretches.at(first)..=stretches.at(last) {
                    stretches.bits[stretch * words + at / 64] |= 1 << (at % 64);
                }
            }
        }
        stretches
    }

    /// The stretch that a place along the axis stands in. A later place never stands in an
    /// earlier stretch.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the cast saturates, so it keeps the order of the places"
    )]
    fn at(&self, place: f64) -> usize {
        (((place - self.low) * self.scale) as usize).min(STRETCHES - 1)
    }
}

/// The solid boxes and the foreign frames that a line's sketches go round, each in the scene's
/// order.
pub(in crate::blocks::planned::dense) struct InTheWay {
    solid: Vec<Solid>,
    frames: Vec<Rect>,
    /// Across each axis, where a segment can stand to run through a solid box: past either end
    /// it runs through none.
    within: [(f64, f64); 2],
    /// The solid boxes by stretches across and down, and how many words of bits each stretch
    /// takes.
    stretches: [Stretches; 2],
    words: usize,
    /// The last segments that ran through boxes alone in their way, and what each added, and
    /// which of them goes next.
    known: [Cell<Option<(Run, f64)>>; 2],
    next: Cell<usize>,
}

impl InTheWay {
    fn new(solid: Vec<Solid>, frames: Vec<Rect>) -> InTheWay {
        let span = |low: fn(&Solid) -> f64, high: fn(&Solid) -> f64| {
            let lowest = solid.iter().map(low).fold(f64::INFINITY, f64::min);
            let highest = solid.iter().map(high).fold(f64::NEG_INFINITY, f64::max);
            (lowest, highest)
        };
        let within = [
            span(|at| at.inner[0], |at| at.inner[2]),
            span(|at| at.inner[1], |at| at.inner[3]),
        ];
        let words = solid.len().div_ceil(64);
        let inner = |first: usize, last: usize| {
            solid
                .iter()
                .map(move |at| (at.inner[first], at.inner[last]))
        };
        let stretches = [
            Stretches::new(within[0], inner(0, 2), words),
            Stretches::new(within[1], inner(1, 3), words),
        ];
        InTheWay {
            solid,
            frames,
            within,
            stretches,
            words,
            known: [Cell::new(None), Cell::new(None)],
            next: Cell::new(0),
        }
    }

    /// Whether a segment stands past every solid box, so it runs through none.
    fn clear(&self, run: &Run) -> bool {
        let (low, high) = self.within[usize::from(!run.upright)];
        run.along <= low || run.along >= high
    }

    /// What a way adds to go round the solid boxes, as `rounds` sums it. A box that the way's
    /// box does not meet adds nothing. A way with one segment among the boxes adds what that
    /// segment adds, so a segment weighed before adds what it added then.
    fn round(&self, sketch: &Sketch) -> f64 {
        let way = Way::new(sketch);
        let runs = &way.runs[..if way.bent { 2 } else { 1 }];
        let mut among = runs.iter().filter(|run| !self.clear(run));
        let (one, two) = (among.next(), among.next());
        let lone = match (one, two) {
            (None, _) => return 0.0,
            (Some(&run), None) => Some(run),
            _ => None,
        };
        let known = (self.known.iter()).find_map(|known| {
            let (run, added) = known.get()?;
            lone.is_some_and(|lone| lone.same(&run)).then_some(added)
        });
        if let Some(added) = known {
            return added;
        }
        // Only the boxes of the stretches that the segments among the boxes stand in.
        let words = self.words;
        let stretch = |run: &Run| {
            let by = &self.stretches[usize::from(!run.upright)];
            &by.bits[by.at(run.along) * words..][..words]
        };
        let (one, two) = (one.map(stretch), two.map(stretch));
        let mut added = 0.0;
        for word in 0..words {
            let mut near = one.map_or(0, |one| one[word]) | two.map_or(0, |two| two[word]);
            while near != 0 {
                added += way.round(&self.solid[word * 64 + near.trailing_zeros() as usize]);
                near &= near - 1;
            }
        }
        if let Some(run) = lone {
            let next = self.next.get();
            self.known[next].set(Some((run, added)));
            self.next.set(1 - next);
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
        InTheWay::new(solid.collect(), frames.collect())
    }

    /// What a line costs among the boxes that stand in its way, solid boxes and foreign frames:
    /// what its cheapest sketch costs.
    ///
    /// A way costs no less than it does with no solid box in its way, so the way that costs less
    /// so goes round the solid boxes first, and the other only where it could cost less still.
    pub(in crate::blocks::planned::dense) fn cost_among(&self, line: usize, way: &InTheWay) -> f64 {
        let ways = self.ways(line);
        // With no frame in the line's way, each way adds nothing to go round frames.
        let frames = if way.frames.is_empty() {
            [0.0; 2]
        } else {
            rounds(&ways, way.frames.iter().copied())
        };
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
