//! The mark on a part that opens another board: a small ring around an arrow
//! that says which way the other board lies, in the top-right corner inside the
//! card or the container's header, near and far alike.

use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, concat, grouped, shape};
use crate::request::DrillDirection;
use crate::scene::{Colour, Geometry, Group, PathStep, Purpose, Role, Shape, Stroke, Transform};

/// The ring's radius.
const DRILL_MARK_RADIUS: f64 = 6.5;
/// The ring's stroke.
const RING_STROKE: f64 = 1.2;
/// How far the mark's centre stands in from a part's top edge and its right edge.
const DRILL_MARK_INSET: f64 = 16.0;

/// What a part keeps clear beside its name for the mark.
pub const DRILL_MARK_ROOM: f64 = 2.0 * DRILL_MARK_RADIUS + 8.0;

/// A move of the arrow to a point.
const fn go(x: f64, y: f64) -> PathStep {
    PathStep::Move { to: Point { x, y } }
}

/// A stroke of the arrow to a point.
const fn to(x: f64, y: f64) -> PathStep {
    PathStep::Line { to: Point { x, y } }
}

/// The arrow inside the ring, drawn about the ring's centre.
fn arrow(direction: DrillDirection) -> Vec<PathStep> {
    match direction {
        DrillDirection::Up => vec![
            go(0.0, 3.1),
            PathStep::Down { y: -3.1 },
            go(-2.7, -0.5),
            to(0.0, -3.2),
            to(2.7, -0.5),
        ],
        DrillDirection::Down => vec![
            go(0.0, -3.1),
            PathStep::Down { y: 3.1 },
            go(-2.7, 0.5),
            to(0.0, 3.2),
            to(2.7, 0.5),
        ],
        DrillDirection::Across => vec![
            go(-3.1, 0.0),
            PathStep::Across { x: 3.1 },
            go(0.5, -2.7),
            to(3.2, 0.0),
            to(0.5, 2.7),
        ],
        DrillDirection::Elsewhere => vec![
            go(-2.3, 2.3),
            to(2.4, -2.4),
            go(-1.1, -2.6),
            PathStep::Across { x: 2.6 },
            PathStep::Down { y: 1.1 },
        ],
    }
}

/// The mark in a box's top-right corner, in a part's own ink, drawn `scale`
/// times its near size about its centre.
pub(super) fn corner_drill_mark(
    rect: Rect,
    direction: DrillDirection,
    ink: &Colour,
    scale: f64,
) -> Items {
    let cx = rect.x + rect.width - DRILL_MARK_INSET;
    let cy = rect.y + DRILL_MARK_INSET;
    grouped(
        Group::new(
            Role::DrillMark(direction),
            concat(vec![
                shape(
                    Shape::new(
                        Purpose::Line,
                        Geometry::Circle {
                            centre: None,
                            radius: DRILL_MARK_RADIUS,
                        },
                    )
                    .unfilled()
                    .stroked(Stroke::new(ink, RING_STROKE).at(0.75)),
                ),
                shape(
                    Shape::path(Purpose::Line, arrow(direction))
                        .unfilled()
                        .stroked(Stroke::new(ink, 1.4).rounded()),
                ),
            ]),
        )
        .moved(Transform {
            x: round_coord(cx),
            y: round_coord(cy),
            scale: (scale != 1.0).then(|| round_coord(scale)),
        }),
    )
}
