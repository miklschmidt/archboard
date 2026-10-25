//! A container is a tray cut into whatever holds it: walls inside its box, a
//! floor a step below what holds it, and a header slab standing on the floor,
//! made of what the tray is cut into. A tray casts no shadow.

use crate::geometry::Rect;
use crate::paint::build::{Items, lines, shape};
use crate::paint::design::{
    BAND_RADIUS, HEADER_SLAB_INSET, SLAB_RADIUS, TRAY_CREASE, TRAY_LIP, TRAY_WALL,
};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, SlabLook, across, plate, slab, slab_shadow};
use crate::request::Standing;
use crate::scene::{Colour, Stroke};

/// How a tray looks: its floor, its walls and its header.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct TrayLook {
    pub floor: Colour,
    pub top_wall: Colour,
    pub side_wall: Colour,
    pub header: Rect,
    pub header_look: SlabLook,
}

/// The corners of a tray's floor.
const FLOOR_RADIUS: f64 = BAND_RADIUS - TRAY_WALL;

/// The short, soft shadow the top wall throws straight down on the floor.
const WALL_SHADOW: [f64; 2] = [0.5, 0.2];
const SHADOW_BAND: f64 = 1.5;

/// The floor's box: inside the walls, the lip and the crease.
pub(super) fn floor_of(rect: Rect) -> Rect {
    Rect {
        x: rect.x + TRAY_WALL,
        y: rect.y + TRAY_WALL,
        width: rect.width - 2.0 * TRAY_WALL,
        height: rect.height - TRAY_WALL - TRAY_LIP - TRAY_CREASE,
    }
}

/// The box of a tray's header slab.
pub(super) fn header_of(rect: Rect, height: f64) -> Rect {
    Rect {
        x: rect.x + HEADER_SLAB_INSET,
        y: rect.y + HEADER_SLAB_INSET,
        width: rect.width - 2.0 * HEADER_SLAB_INSET,
        height: height - HEADER_SLAB_INSET,
    }
}

/// One tray; a removed container draws nothing here.
pub(super) fn tray(
    rect: Rect,
    look: &TrayLook,
    palette: &Palette,
    standing: Option<Standing>,
) -> Items {
    if standing == Some(Standing::Removed) {
        return Items::new();
    }
    let floor = floor_of(rect);
    let walls = Rect {
        height: rect.height - TRAY_CREASE - TRAY_LIP,
        ..rect
    };
    let mut parts = vec![
        shape(plate(rect, BAND_RADIUS).filled(&palette.slab_shadow)),
        shape(
            plate(
                Rect {
                    height: rect.height - TRAY_CREASE,
                    ..rect
                },
                BAND_RADIUS,
            )
            .filled(&palette.tray_lip),
        ),
        shape(plate(walls, BAND_RADIUS).filled(&look.top_wall)),
        shape(
            plate(
                Rect {
                    y: walls.y + TRAY_WALL,
                    height: walls.height - TRAY_WALL,
                    ..walls
                },
                BAND_RADIUS,
            )
            .filled(&look.side_wall),
        ),
        shape(plate(floor, FLOOR_RADIUS).filled(&look.floor)),
    ];
    for (index, share) in WALL_SHADOW.iter().enumerate() {
        parts.push(across(
            floor,
            floor.y + (index as f64 + 0.5) * SHADOW_BAND,
            Stroke::new(&palette.slab_shadow, SHADOW_BAND).at(*share),
        ));
    }
    parts.push(slab_shadow(
        look.header,
        SLAB_RADIUS,
        Lift::Card,
        palette,
        None,
    ));
    parts.push(slab(
        look.header,
        &look.header_look,
        palette,
        standing,
        None,
    ));
    lines(parts)
}
