//! The control at the right end of a door or a frame's tab: a thin rule, and a
//! plus that brings a module in or a minus that takes it back out. The whole end
//! takes the pointer, and the reader's stylesheet lights it under the pointer. Only
//! a live reader's picture wears one, so an export never shows what nothing presses.

use crate::drawing::Toggle;
use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, grouped, lines, shape};
use crate::paint::design::TOGGLE_ROOM;
use crate::paint::slab::{ghost_light, plate, slab_seat};
use crate::scene::{Cap, Colour, Geometry, Group, PathStep, Pointer, Purpose, Role, Shape, Stroke};

/// How far the rule stands in from the top and the foot of what it parts.
const RULE_INSET: f64 = 8.0;
/// How strong the rule is.
const RULE: f64 = 0.4;
/// How far the glyph reaches from its centre.
const GLYPH: f64 = 5.5;
/// How heavy the glyph is.
const GLYPH_WIDTH: f64 = 1.8;
/// How far the light under the pointer stands in from the end, and how round it is.
const LIGHT_INSET: f64 = 5.0;
const LIGHT_RADIUS: f64 = 4.0;

/// The plus or the minus, about its centre.
fn glyph(toggle: Toggle, at: Point, scale: f64) -> Vec<PathStep> {
    let reach = GLYPH * scale;
    let mut steps = vec![
        PathStep::Move {
            to: Point {
                x: at.x - reach,
                y: at.y,
            },
        },
        PathStep::Line {
            to: Point {
                x: at.x + reach,
                y: at.y,
            },
        },
    ];
    if toggle == Toggle::Expand {
        steps.extend([
            PathStep::Move {
                to: Point {
                    x: at.x,
                    y: at.y - reach,
                },
            },
            PathStep::Line {
                to: Point {
                    x: at.x,
                    y: at.y + reach,
                },
            },
        ]);
    }
    steps
}

/// The control at the right end of a box, in the ink of what it stands on.
pub(super) fn toggle_end(rect: Rect, toggle: Toggle, ink: &Colour, scale: f64) -> Items {
    let end = Rect {
        x: rect.x + rect.width - TOGGLE_ROOM,
        width: TOGGLE_ROOM,
        ..rect
    };
    let light = Rect {
        x: end.x + LIGHT_INSET,
        y: end.y + LIGHT_INSET,
        width: end.width - 2.0 * LIGHT_INSET,
        height: end.height - 2.0 * LIGHT_INSET,
    };
    let rule_x = round_coord(end.x);
    let middle = Point {
        x: round_coord(end.x + end.width / 2.0),
        y: round_coord(end.y + end.height / 2.0),
    };
    grouped(Group::new(
        Role::Toggle(toggle),
        lines(vec![
            slab_seat(end, 0.0),
            shape(ghost_light(plate(light, LIGHT_RADIUS), ink)),
            shape(
                Shape::new(
                    Purpose::Rule,
                    Geometry::Line {
                        from: Point {
                            x: rule_x,
                            y: round_coord(end.y + RULE_INSET),
                        },
                        to: Point {
                            x: rule_x,
                            y: round_coord(end.y + end.height - RULE_INSET),
                        },
                    },
                )
                .pointer(Pointer::None)
                .stroked(Stroke::new(ink, 1.0).at(RULE)),
            ),
            shape(
                Shape::path(Purpose::Line, glyph(toggle, middle, scale))
                    .unfilled()
                    .pointer(Pointer::None)
                    .stroked(Stroke::new(ink, GLYPH_WIDTH).capped(Cap::Round)),
            ),
        ]),
    ))
}
