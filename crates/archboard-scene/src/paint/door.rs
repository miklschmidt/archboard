//! A door: a module outside the open frame, named on one line, half a card's
//! height and as wide as its name needs. A door is a place a line leads to, so
//! it must not read as a card that lost its words.

use crate::drawing::Node;
use crate::geometry::Rect;
use crate::paint::Ctx;
use crate::paint::build::{Items, grouped, lines, shape};
use crate::paint::cards::halo;
use crate::paint::edge_tab::line_views;
use crate::paint::far_card::Part;
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, plate, slab_seat, slab_shadow, standing_border};
use crate::paint::standing::{standing_pin, subject, warning_badge};
use crate::paint::styles::Styles;
use crate::request::Standing;
use crate::scene::{Group, Role, Stroke};

/// How round a door's corners are.
const DOOR_RADIUS: f64 = 18.0;
/// How heavy a door's outline is.
const DOOR_LINE: f64 = 1.2;

/// What a door looks like: the one place to change it.
fn door_plate(rect: Rect, standing: Option<Standing>, palette: &Palette) -> Items {
    if standing == Some(Standing::Removed) {
        return slab_shadow(rect, DOOR_RADIUS, Lift::Card, palette, standing);
    }
    lines(vec![
        shape(
            plate(rect, DOOR_RADIUS)
                .unfilled()
                .stroked(Stroke::new(&palette.edge, DOOR_LINE)),
        ),
        standing_border(rect, DOOR_RADIUS, standing, palette),
    ])
}

/// One door, with its seat, its ring, its words and its standing's marks.
pub(super) fn paint_door(ctx: &Ctx<'_>, placed: &Node, part: &Part<'_>, palette: &Palette) -> Items {
    let Part { rect, standing, .. } = *part;
    grouped(
        Group::new(
            Role::Card(Box::new(part.appearance.clone())),
            lines(vec![
                slab_seat(rect, DOOR_RADIUS),
                halo(rect, DOOR_RADIUS, &Styles::of(palette), standing),
                door_plate(rect, standing, palette),
                line_views(ctx, placed, rect, palette, standing, part.appearance),
                standing_pin(rect, standing, palette),
                warning_badge(rect, part.unsettled, palette),
            ]),
        )
        .drawing(subject(part.kind, &part.node.id, standing)),
    )
}
