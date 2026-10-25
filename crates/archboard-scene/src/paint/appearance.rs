//! How a part looks by its appearance: a card's face and edge in its group's
//! colour, a label's plate, a container's tray, and the type chip.

use std::collections::BTreeMap;

use crate::geometry::Rect;
use crate::js;
use crate::paint::build::{Items, concat, shape};
use crate::paint::colour::{Inked, Share, Tone, ToneStep, inked_over, mixed, tinted, toned};
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

const DARK_FACE: ToneStep = ToneStep::new(0.31, 0.4);
const CARD_EDGE: Tone = Tone {
    light: ToneStep::new(0.78, 0.8),
    dark: ToneStep::new(0.212, 0.45),
};

/// A grouped card's face on the light ground, by colour: its lightness and its chroma.
#[expect(
    clippy::match_same_arms,
    reason = "a table of one row per colour: two colours that share a value do so by chance"
)]
fn light_face(color: PaletteColor) -> (f64, f64) {
    match color {
        PaletteColor::Red => (0.89, 0.053),
        PaletteColor::Orange => (0.89, 0.057),
        PaletteColor::Amber => (0.89, 0.069),
        PaletteColor::Yellow => (0.92, 0.055),
        PaletteColor::Lime | PaletteColor::Green | PaletteColor::Emerald | PaletteColor::Teal => {
            (0.92, 0.07)
        }
        PaletteColor::Cyan => (0.89, 0.07),
        PaletteColor::Sky => (0.89, 0.055),
        PaletteColor::Blue => (0.89, 0.049),
        PaletteColor::Indigo => (0.89, 0.05),
        PaletteColor::Violet => (0.89, 0.054),
        PaletteColor::Purple => (0.89, 0.062),
        PaletteColor::Fuchsia => (0.89, 0.07),
        PaletteColor::Pink => (0.89, 0.06),
        PaletteColor::Rose => (0.89, 0.053),
    }
}

/// A grouped card's face: a tone of its group's colour.
fn face_in(color: PaletteColor) -> Colour {
    let (lightness, chroma) = light_face(color);
    toned(
        &Colour::palette(color),
        Tone {
            light: ToneStep {
                lightness,
                chroma: 1.0,
                cap: chroma,
            },
            dark: DARK_FACE,
        },
    )
}

const TRAY_SINK: Share = Share {
    light: 0.4,
    dark: 0.4,
};
const TRAY_SINK_MAX: Share = Share {
    light: 0.8,
    dark: 0.8,
};
const TOP_WALL: Share = Share {
    light: 0.8,
    dark: 0.45,
};
const SIDE_WALL: Share = Share {
    light: 0.4,
    dark: 0.28,
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

/// A card's slab: its face tinted and its front edge toned by its group.
pub(super) fn card_look(body_color: Option<PaletteColor>, palette: &Palette) -> SlabLook {
    SlabLook {
        tintable: true,
        sheen: true,
        ..SlabLook::plain(
            body_color.map_or_else(|| palette.slab_face.clone(), face_in),
            semantic_ink(body_color)
                .map_or_else(|| palette.slab_edge.clone(), |ink| toned(&ink, CARD_EDGE)),
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

/// A container's tray: a neutral well with a header slab made of what holds it.
pub(super) fn tray_look(header: Rect, palette: &Palette, depth: f64) -> TrayLook {
    let floor = floor_at(depth, palette);
    let ground = if depth == 0.0 {
        palette.background.clone()
    } else {
        floor_at(depth - 1.0, palette)
    };
    TrayLook {
        top_wall: tinted(&floor, Some(&palette.slab_deep), TOP_WALL),
        side_wall: tinted(&floor, Some(&palette.slab_deep), SIDE_WALL),
        floor,
        header,
        header_look: SlabLook::plain(
            ground.clone(),
            tinted(&ground, Some(&palette.slab_deep), TOP_WALL),
            CARD_THICKNESS,
            SLAB_RADIUS,
        ),
    }
}

/// One type chip at the origin, a small tile raised off the face it sits on;
/// on a removed part a flat, see-through tile under its glyph.
pub(super) fn type_chip(
    appearance: &NodeAppearance,
    palette: &Palette,
    standing: Option<Standing>,
    icons: &BTreeMap<String, Vec<String>>,
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
        tintable: false,
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
