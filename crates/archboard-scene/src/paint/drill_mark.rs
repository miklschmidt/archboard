//! The mark on a part that opens another board: a small ring around an arrow
//! that says which way the other board lies, in the top-right corner inside the
//! card or the container's header, near and far alike.

use crate::attrs;
use crate::geometry::{Rect, coord};
use crate::markup::{Markup, concat, group, tag};
use crate::request::DrillDirection;
use crate::scene::Role;

/// The ring's radius.
const DRILL_MARK_RADIUS: f64 = 6.5;
/// The ring's stroke.
const RING_STROKE: f64 = 1.2;
/// How far the mark's centre stands in from a part's top edge and its right edge.
const DRILL_MARK_INSET: f64 = 16.0;

/// What a part keeps clear beside its name for the mark.
pub const DRILL_MARK_ROOM: f64 = 2.0 * DRILL_MARK_RADIUS + 8.0;

/// The arrow inside the ring, drawn about the ring's centre.
fn arrow(direction: DrillDirection) -> &'static str {
    match direction {
        DrillDirection::Up => "M0,3.1 V-3.1 M-2.7,-0.5 L0,-3.2 L2.7,-0.5",
        DrillDirection::Down => "M0,-3.1 V3.1 M-2.7,0.5 L0,3.2 L2.7,0.5",
        DrillDirection::Across => "M-3.1,0 H3.1 M0.5,-2.7 L3.2,0 L0.5,2.7",
        DrillDirection::Elsewhere => "M-2.3,2.3 L2.4,-2.4 M-1.1,-2.6 H2.6 V1.1",
    }
}

/// The mark in a box's top-right corner, in a part's own ink, drawn `scale`
/// times its near size about its centre.
pub fn corner_drill_mark(rect: Rect, direction: DrillDirection, ink: &str, scale: f64) -> Markup {
    let cx = rect.x + rect.width - DRILL_MARK_INSET;
    let cy = rect.y + DRILL_MARK_INSET;
    let scaled = if scale == 1.0 {
        String::new()
    } else {
        format!(" scale({})", coord(scale))
    };
    group(
        Role::DrillMark,
        None,
        attrs! {
            "class": "ab-drill",
            "data-drill": direction.as_str(),
            "transform": format!("translate({},{}){scaled}", coord(cx), coord(cy)),
        },
        concat(vec![
            tag(
                "circle",
                attrs! {
                    "r": DRILL_MARK_RADIUS,
                    "fill": "none",
                    "stroke": ink,
                    "stroke-width": RING_STROKE,
                    "stroke-opacity": 0.75,
                },
            ),
            tag(
                "path",
                attrs! {
                    "d": arrow(direction),
                    "fill": "none",
                    "stroke": ink,
                    "stroke-width": 1.4,
                    "stroke-linecap": "round",
                    "stroke-linejoin": "round",
                },
            ),
        ]),
    )
}
