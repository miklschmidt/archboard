//! A container is a tray cut into whatever holds it: walls inside its box, a
//! floor a step below what holds it, and a header slab standing on the floor,
//! made of what the tray is cut into. A tray casts no shadow.

use crate::attrs;
use crate::geometry::Rect;
use crate::markup::{Markup, lines};
use crate::paint::design::{BAND_RADIUS, HEADER_SLAB_INSET, SLAB_RADIUS, TRAY_CREASE, TRAY_LIP, TRAY_WALL};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, SlabLook, across, plate, slab, slab_shadow};
use crate::request::Standing;

/// How a tray looks: its floor, its walls and its header.
#[derive(Clone, Debug, PartialEq)]
pub struct TrayLook {
    pub floor: String,
    pub top_wall: String,
    pub side_wall: String,
    pub header: Rect,
    pub header_look: SlabLook,
}

/// The corners of a tray's floor.
const FLOOR_RADIUS: f64 = BAND_RADIUS - TRAY_WALL;

/// The short, soft shadow the top wall throws straight down on the floor.
const WALL_SHADOW: [f64; 2] = [0.5, 0.2];
const SHADOW_BAND: f64 = 1.5;

/// The floor's box: inside the walls, the lip and the crease.
pub fn floor_of(rect: Rect) -> Rect {
    Rect {
        x: rect.x + TRAY_WALL,
        y: rect.y + TRAY_WALL,
        width: rect.width - 2.0 * TRAY_WALL,
        height: rect.height - TRAY_WALL - TRAY_LIP - TRAY_CREASE,
    }
}

/// The box of a tray's header slab.
pub fn header_of(rect: Rect, height: f64) -> Rect {
    Rect {
        x: rect.x + HEADER_SLAB_INSET,
        y: rect.y + HEADER_SLAB_INSET,
        width: rect.width - 2.0 * HEADER_SLAB_INSET,
        height: height - HEADER_SLAB_INSET,
    }
}

/// One tray; a removed container draws nothing here.
pub fn tray(rect: Rect, look: &TrayLook, palette: &Palette, standing: Option<Standing>) -> Markup {
    if standing == Some(Standing::Removed) {
        return Markup::new();
    }
    let floor = floor_of(rect);
    let walls = Rect { height: rect.height - TRAY_CREASE - TRAY_LIP, ..rect };
    let mut parts = vec![
        plate(rect, BAND_RADIUS, attrs! { "fill": palette.slab_shadow }),
        plate(Rect { height: rect.height - TRAY_CREASE, ..rect }, BAND_RADIUS, attrs! { "fill": palette.tray_lip }),
        plate(walls, BAND_RADIUS, attrs! { "fill": look.top_wall.as_str() }),
        plate(
            Rect { y: walls.y + TRAY_WALL, height: walls.height - TRAY_WALL, ..walls },
            BAND_RADIUS,
            attrs! { "fill": look.side_wall.as_str() },
        ),
        plate(floor, FLOOR_RADIUS, attrs! { "fill": look.floor.as_str() }),
    ];
    for (index, share) in WALL_SHADOW.iter().enumerate() {
        parts.push(across(
            floor,
            floor.y + (index as f64 + 0.5) * SHADOW_BAND,
            attrs! {
                "stroke": palette.slab_shadow,
                "stroke-opacity": *share,
                "stroke-width": SHADOW_BAND,
            },
        ));
    }
    parts.push(slab_shadow(look.header, SLAB_RADIUS, Lift::Card, palette, None));
    parts.push(slab(look.header, &look.header_look, palette, standing, None));
    lines(parts)
}
