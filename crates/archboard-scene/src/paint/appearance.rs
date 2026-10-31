//! How a part looks by its appearance: a card's neutral face and edge, a label's
//! plate, a container's tray, and the type chip.

use std::collections::BTreeMap;

use crate::geometry::Rect;
use crate::js;
use crate::paint::build::{Items, concat, shape};
use crate::paint::colour::{Inked, Share, ToneStep, inked_over, mixed, tinted};
use crate::paint::design::{
    CARD_THICKNESS, CHIP_THICKNESS, ICON_CHIP_RADIUS, ICON_CHIP_SIZE, PILL_RADIUS, PILL_THICKNESS,
    SLAB_RADIUS,
};
use crate::paint::icons::glyph_group;
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, SlabLook, ghost_face, slab, slab_shadow};
use crate::paint::tray::TrayLook;
use crate::request::{NodeAppearance, PaletteColor, Standing};
use crate::scene::{Colour, Paint, Purpose, Shape};

/// One named palette colour.
pub(super) fn semantic_ink(color: Option<PaletteColor>) -> Option<Colour> {
    color.map(Colour::palette)
}

const TRAY_SINK: Share = Share {
    light: 0.4,
    dark: 0.4,
};
const TRAY_SINK_MAX: Share = Share {
    light: 0.8,
    dark: 0.8,
};
const LABEL_EDGE: f64 = 0.6;
const CHIP_FACE: Inked = Inked {
    light: ToneStep::new(0.955, 0.17),
    dark: 0.2,
};
const CHIP_EDGE: Inked = Inked {
    light: ToneStep::new(0.78, 0.5),
    dark: 0.2,
};

/// A card's slab: a neutral face, whatever its groups.
pub(super) fn card_look(palette: &Palette) -> SlabLook {
    SlabLook {
        soft: true,
        sheen: true,
        ..SlabLook::plain(
            palette.slab_face.clone(),
            palette.slab_edge.clone(),
            CARD_THICKNESS,
            SLAB_RADIUS,
        )
    }
}

/// A relationship's or a message's label: a low tile, its face the plate its words are read on.
pub(super) fn label_look(palette: &Palette) -> SlabLook {
    SlabLook::plain(
        palette.pill.clone(),
        mixed(&palette.pill, &palette.slab_deep, LABEL_EDGE),
        PILL_THICKNESS,
        PILL_RADIUS,
    )
}

/// The floor of a tray nested in some containers: a step deeper for each.
fn floor_at(depth: f64, palette: &Palette) -> Colour {
    let sink = Share {
        light: js::js_min(TRAY_SINK_MAX.light, depth * TRAY_SINK.light),
        dark: js::js_min(TRAY_SINK_MAX.dark, depth * TRAY_SINK.dark),
    };
    tinted(&palette.tray_floor, Some(&palette.tray_sink), sink)
}

/// A frame's well at a depth, and the raised tab that stands on its edge.
pub(super) fn tray_look(palette: &Palette, depth: f64) -> TrayLook {
    TrayLook {
        floor: floor_at(depth, palette),
        tab: palette.tray_tab.clone(),
        line: palette.tray_line.clone(),
    }
}

/// One type chip at the origin, a small tile raised off the face it sits on;
/// on a removed part a flat, see-through tile under its glyph.
pub(super) fn type_chip(
    appearance: &NodeAppearance,
    palette: &Palette,
    standing: Option<Standing>,
    icons: &BTreeMap<String, Vec<String>>,
    icon_size: f64,
) -> Items {
    let ink = semantic_ink(appearance.type_color).unwrap_or_else(|| palette.glyph.clone());
    let rect = Rect {
        x: 0.0,
        y: 0.0,
        width: ICON_CHIP_SIZE,
        height: ICON_CHIP_SIZE,
    };
    let glyph = glyph_group(
        &appearance.icon,
        ICON_CHIP_SIZE / 2.0,
        (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2.0,
        &ink,
        icons,
        icon_size,
    );
    if standing == Some(Standing::Removed) {
        return concat(vec![
            shape(ghost_face(
                Shape::rect(Purpose::Box, rect, Some(ICON_CHIP_RADIUS)),
                palette,
            )),
            glyph,
        ]);
    }
    concat(vec![chip_tile(rect, &ink, palette), glyph])
}

/// A type chip's tile without its glyph, and the shadow it casts.
pub(super) fn chip_tile(rect: Rect, ink: &Colour, palette: &Palette) -> Items {
    let face = inked_over(&palette.slab_face, ink, CHIP_FACE);
    let look = SlabLook {
        face: Paint::from(&face),
        soft: false,
        lit: face,
        edge: inked_over(&palette.slab_edge, ink, CHIP_EDGE),
        thickness: CHIP_THICKNESS,
        radius: ICON_CHIP_RADIUS,
        sheen: true,
    };
    concat(vec![
        slab_shadow(rect, ICON_CHIP_RADIUS, Lift::Chip, palette, None),
        slab(rect, &look, palette, None, None),
    ])
}
