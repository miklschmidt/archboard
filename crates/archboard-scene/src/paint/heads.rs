//! The marks a relationship's line wears at its ends, which say what its
//! relationship does: a solid wedge for a mutation, an eye for a query, an "="
//! and a small open point for a compute, a detached chevron for a dependency
//! that states none, and a hollow ring at the caller of a query. A flow step
//! and a reading from before effects keep the classic filled and open heads.
//!
//! Each mark is drawn in a square of its own, in the picture's own units, so
//! it is as big on every line whatever the line's weight, and it scales with
//! the picture as the line does. A new mark's line stops short of it. Its end
//! is the point that stands on the end of the line's route: the tip of a head,
//! the centre of a ring.

use crate::geometry::Point;
use crate::paint::styles::HEAD_LENGTH;
use crate::scene::{Colour, Geometry, Head, Marker, MarkerId, PathStep, Purpose, Shape, Stroke};

/// The side of the square a new mark is drawn in, in its own units.
const MARK_BOX: f64 = 16.0;
/// How far back from its tip the longest mark, an "=" and its point, lets the
/// body end, in its square's units.
const EQUALS_BACK: f64 = 13.8;
/// The straight run a line needs after its last bend: the longest mark, about
/// 21 units, and about 9 units of body straight before it, so a head reads
/// along its line and never sits on or just after a bend.
pub(super) const APPROACH: f64 = 30.0;
/// The least length of a line with no bend: its longest marks, a head and a
/// ring at its start, and a little of the body between them. Such a line has
/// no bend for a head to sit on, so it needs no approach.
pub(super) const STRAIGHT_RUN: f64 = 23.0;

/// How many picture units one unit of a new mark's square is: a wedge 15
/// units long and as wide, about six times as long as its line is thick, so it
/// reads as the end of its line at the opening zoom and never competes with a
/// card.
const MARK_UNIT: f64 = 1.5;
/// How far a mutation's imprint reaches along its target's edge to either
/// side of the tip, where the edge has room: a little wider than its wedge.
pub(super) const IMPRINT_REACH: f64 = 6.0 * MARK_UNIT;
/// How thick a mutation's imprint is drawn: as thick as an emphasised line,
/// so it reads as the mark the wedge leaves and the wedge keeps its point.
pub(super) const IMPRINT_WIDTH: f64 = 2.4 * MARK_UNIT;
/// How broad the glow round a mutation's imprint is across its target's edge,
/// a lane, and how solid it is at its heart on a light ground and on a dark
/// one: paler on the light ground, where a dense haze reads as a smudge.
pub(super) const IMPRINT_GLOW: (f64, f64, f64) = (16.0, 0.4, 0.6);
/// The side of the square a classic head is drawn in, in its own units.
const CLASSIC_BOX: f64 = 10.0;
/// Where a new head's tip lies in its square.
const TIP: Point = Point {
    x: MARK_BOX,
    y: MARK_BOX / 2.0,
};
/// How thick the outline of an eye, an "=" and a point are drawn.
const OUTLINE: f64 = 1.5;
/// How thick a detached chevron is drawn: it ends a thinner line.
const DETACHED_OUTLINE: f64 = 1.35;
/// How big a ring at the caller is round, to the middle of its outline.
const RING_RADIUS: f64 = 2.8;
/// How thick the arms of a classic open head are, in its own units.
pub(super) const OPEN_ARM: f64 = 1.7;

/// A point of a mark's square.
const fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// A point of a new mark's square, measured back from the tip and across the line.
const fn back(along: f64, aside: f64) -> Point {
    at(TIP.x - along, TIP.y + aside)
}

/// A mark's square, the point laid on the end of the line's body, and the
/// point that stands on the end of the line's route.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Place {
    pub view: f64,
    pub reference: Point,
    pub end: Point,
}

/// Where a mark stands in its square.
pub(super) fn place_of(head: Head) -> Place {
    let new = |reference: Point, end: Point| Place {
        view: MARK_BOX,
        reference,
        end,
    };
    let classic = |x: f64| Place {
        view: CLASSIC_BOX,
        reference: at(x, CLASSIC_BOX / 2.0),
        end: at(CLASSIC_BOX, CLASSIC_BOX / 2.0),
    };
    match head {
        Head::Filled => classic(8.0),
        Head::Open => classic(CLASSIC_BOX),
        Head::Wedge => new(back(10.0, 0.0), TIP),
        Head::Eye | Head::Detached => new(back(10.5, 0.0), TIP),
        Head::Equals => new(back(EQUALS_BACK, 0.0), TIP),
        // A ring at the start is laid facing back along the line: its centre
        // stands on the caller's edge, and the body starts past its outline.
        Head::Ring => new(
            at(MARK_BOX / 2.0 - RING_RADIUS - OUTLINE / 2.0, MARK_BOX / 2.0),
            at(MARK_BOX / 2.0, MARK_BOX / 2.0),
        ),
    }
}

/// How long a mark's square is drawn, in picture units: a classic head 11
/// units long at every weight, a new mark at its own scale.
pub(super) fn mark_length(head: Head) -> f64 {
    match head {
        Head::Filled | Head::Open => HEAD_LENGTH,
        _ => MARK_BOX * MARK_UNIT,
    }
}

/// How far a ring at the caller reaches from its centre, in picture units.
pub(super) fn ring_reach() -> f64 {
    (RING_RADIUS + OUTLINE / 2.0) * MARK_UNIT
}

/// How far the body of a line stops short of its end for a mark: none for a
/// classic head, which lies over the body's end.
pub(super) fn body_short_of(head: Head) -> f64 {
    match head {
        Head::Filled | Head::Open => 0.0,
        _ => {
            let place = place_of(head);
            (place.end.x - place.reference.x) * MARK_UNIT
        }
    }
}

/// How far back from the end of its route a mark's ink reaches.
pub(super) fn ink_reach(head: Head) -> f64 {
    let place = place_of(head);
    match head {
        Head::Filled => HEAD_LENGTH * place.reference.x / CLASSIC_BOX,
        Head::Open => HEAD_LENGTH * (CLASSIC_BOX - 2.0 + OPEN_ARM / 2.0) / CLASSIC_BOX,
        _ => body_short_of(head),
    }
}

/// A straight run through some points of a mark's square.
fn run(points: &[Point]) -> Vec<PathStep> {
    points
        .iter()
        .enumerate()
        .map(|(index, to)| {
            if index == 0 {
                PathStep::Move { to: *to }
            } else {
                PathStep::Line { to: *to }
            }
        })
        .collect()
}

/// A stroked run in one ink.
fn stroked(points: &[Point], ink: &Colour, width: f64) -> Shape {
    Shape::path(Purpose::Arrowhead, run(points)).stroked(Stroke::new(ink, width).rounded())
}

/// A point that opens toward the tip, two arms long `along` and `aside` wide.
fn point(along: f64, aside: f64, ink: &Colour, width: f64) -> Shape {
    stroked(&[back(along, -aside), TIP, back(along, aside)], ink, width)
}

/// The outline of a classic head in its ten-unit square: closed for a filled
/// head, two arms for an open one.
pub(super) fn classic_outline(head: Head) -> Vec<PathStep> {
    if head == Head::Filled {
        let mut steps = run(&[at(0.0, 0.0), at(10.0, 5.0), at(0.0, 10.0)]);
        steps.push(PathStep::Close);
        steps
    } else {
        run(&[at(2.0, 1.0), at(10.0, 5.0), at(2.0, 9.0)])
    }
}

/// What a mark draws in its square, in one ink.
pub(super) fn mark_shapes(head: Head, ink: &Colour) -> Vec<Shape> {
    match head {
        Head::Filled => {
            vec![Shape::path(Purpose::Arrowhead, classic_outline(head)).filled(ink)]
        }
        Head::Open => vec![
            Shape::path(Purpose::Arrowhead, classic_outline(head))
                .stroked(Stroke::new(ink, OPEN_ARM).rounded()),
        ],
        Head::Wedge => {
            let mut steps = run(&[back(10.0, -5.0), TIP, back(10.0, 5.0)]);
            steps.push(PathStep::Close);
            vec![Shape::path(Purpose::Arrowhead, steps).filled(ink)]
        }
        Head::Eye => {
            let mut steps = vec![
                PathStep::Move {
                    to: back(10.5, 0.0),
                },
                PathStep::Quad {
                    control: back(8.4, -4.2),
                    to: back(5.8, -3.8),
                },
                PathStep::Line { to: TIP },
                PathStep::Line { to: back(5.8, 3.8) },
                PathStep::Quad {
                    control: back(8.4, 4.2),
                    to: back(10.5, 0.0),
                },
            ];
            steps.push(PathStep::Close);
            vec![
                Shape::path(Purpose::Arrowhead, steps).stroked(Stroke::new(ink, OUTLINE).rounded()),
                Shape::new(
                    Purpose::Arrowhead,
                    Geometry::Circle {
                        centre: back(6.2, 0.0),
                        radius: 0.95,
                    },
                )
                .filled(ink),
            ]
        }
        // The bars stand wide apart and reach well past the line, so the "="
        // keeps its gap open and reads apart from its line at the opening zoom.
        Head::Equals => vec![
            point(3.0, 3.0, ink, OUTLINE),
            stroked(&[back(5.6, -4.5), back(5.6, 4.5)], ink, OUTLINE),
            stroked(&[back(11.2, -4.5), back(11.2, 4.5)], ink, OUTLINE),
        ],
        Head::Detached => vec![point(5.25, 3.75, ink, DETACHED_OUTLINE)],
        Head::Ring => vec![
            Shape::new(
                Purpose::Arrowhead,
                Geometry::Circle {
                    centre: at(MARK_BOX / 2.0, MARK_BOX / 2.0),
                    radius: RING_RADIUS,
                },
            )
            .stroked(Stroke::new(ink, OUTLINE)),
        ],
    }
}

/// A mark as a marker in one ink, drawn at its own length in the picture's
/// units on a line of every weight.
pub(super) fn mark_marker(id: MarkerId, head: Head, ink: &Colour) -> Marker {
    let place = place_of(head);
    Marker {
        id,
        view: place.view,
        reference: place.reference,
        size: mark_length(head),
        shapes: mark_shapes(head, ink),
    }
}

#[cfg(test)]
mod tests {
    use super::{APPROACH, STRAIGHT_RUN, body_short_of};
    use crate::scene::Head;

    #[test]
    fn every_mark_and_a_little_body_fit_the_straight_approach_and_a_straight_line() {
        for head in [Head::Wedge, Head::Eye, Head::Equals, Head::Detached] {
            assert!(body_short_of(head) + 2.0 <= APPROACH, "{head:?}");
            let ring = if head == Head::Eye {
                body_short_of(Head::Ring)
            } else {
                0.0
            };
            assert!(body_short_of(head) + ring + 1.5 <= STRAIGHT_RUN, "{head:?}");
        }
    }
}
