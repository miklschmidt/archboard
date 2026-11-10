//! The straight chords between the middles of lines' boxes, which crossings are counted on.

use crate::geometry::{Point, Rect};

use super::{Line, Scene, TOUCH, centre};

/// The straight chord between the middles of a line's boxes, which crossings are counted on.
#[derive(Clone, Copy, Debug)]
pub(in crate::blocks::planned::dense) struct Chord {
    from: Point,
    to: Point,
    span: Rect,
    /// The span's far sides, moved out by the room that keeps a touch apart.
    outer: Point,
}

impl Chord {
    pub(super) fn new(a: Rect, b: Rect) -> Chord {
        let (from, to) = (centre(a), centre(b));
        let span = Rect {
            x: from.x.min(to.x),
            y: from.y.min(to.y),
            width: (from.x - to.x).abs(),
            height: (from.y - to.y).abs(),
        };
        Chord {
            from,
            to,
            span,
            outer: Point {
                x: span.x + span.width + TOUCH,
                y: span.y + span.height + TOUCH,
            },
        }
    }

    /// Whether the spans of two chords meet, edges apart.
    fn meets(&self, other: &Chord) -> bool {
        self.span.x < other.outer.x
            && other.span.x < self.outer.x
            && self.span.y < other.outer.y
            && other.span.y < self.outer.y
    }

    /// Whether two chords cross away from their ends. Chords along one line do not cross.
    pub(in crate::blocks::planned::dense) fn crosses(&self, other: &Chord) -> bool {
        self.meets(other)
            && turn(self.from, self.to, other.from) * turn(self.from, self.to, other.to) < 0.0
            && turn(other.from, other.to, self.from) * turn(other.from, other.to, self.to) < 0.0
    }

    /// How many of the chords past a line this chord of the line crosses: `crosses`, with the
    /// turn of each chord to the line's still end made once.
    pub(in crate::blocks::planned::dense) fn crossings(&self, past: &Past) -> usize {
        let moving = if past.source { self.from } else { self.to };
        (past.chords.iter())
            .filter(|(other, side)| {
                self.meets(other)
                    && turn(self.from, self.to, other.from) * turn(self.from, self.to, other.to)
                        < 0.0
                    && side * turn(other.from, other.to, moving) < 0.0
            })
            .count()
    }
}

/// Which way a point stands from the line through two others: none within a thousandth of none.
fn turn(p: Point, q: Point, r: Point) -> f64 {
    let value = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if value.abs() < 1e-3 {
        0.0
    } else {
        value.signum()
    }
}

/// Some fixed chords that a line can cross while only one of its ends moves, each with the side
/// that the line's still end stands on from it. The still end stands on no side of a chord that
/// ends on its box, and the line crosses no such chord.
pub(in crate::blocks::planned::dense) struct Past {
    chords: Vec<(Chord, f64)>,
    /// Whether the line's source is the end that moves.
    source: bool,
}

impl Scene {
    /// The fixed chords that a line can cross while only its end on one box moves.
    pub(in crate::blocks::planned::dense) fn past(
        &self,
        line: usize,
        moving: usize,
        fixed: &[Chord],
    ) -> Past {
        let Line { from, to, .. } = self.lines[line];
        let still = centre(self.boxes[if from == moving { to } else { from }]);
        let sides = (fixed.iter()).map(|&chord| (chord, turn(chord.from, chord.to, still)));
        Past {
            chords: sides.filter(|&(_, side)| side != 0.0).collect(),
            source: from == moving,
        }
    }
}
