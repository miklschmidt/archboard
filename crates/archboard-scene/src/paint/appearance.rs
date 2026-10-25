//! How a part looks by its appearance: a card's face and edge in its group's
//! colour, a label's plate, a container's tray, and the type chip.

use std::collections::BTreeMap;

use crate::attrs;
use crate::geometry::Rect;
use crate::js;
use crate::markup::{Attrs, Markup, concat, tag};
use crate::paint::colour::{Inked, Share, Tone, ToneStep, inked_over, mixed, tinted, toned};
use crate::paint::design::{
    CARD_THICKNESS, CHIP_THICKNESS, ICON_CHIP_RADIUS, ICON_CHIP_SIZE, PILL_RADIUS, PILL_THICKNESS,
    SLAB_RADIUS,
};
use crate::paint::icons::glyph_group;
use crate::paint::palette::{Palette, token};
use crate::paint::slab::{Lift, SlabLook, ghost_face, slab, slab_shadow};
use crate::paint::tray::TrayLook;
use crate::request::{NodeAppearance, PaletteColor, Standing};

/// One named palette colour, as the page's token for it.
pub fn semantic_ink(color: Option<PaletteColor>) -> Option<String> {
    color.map(semantic_token)
}

/// A named palette colour's page token.
fn semantic_token(color: PaletteColor) -> String {
    token(&format!("--semantic-{}", color.as_str()))
}

const DARK_FACE: ToneStep = ToneStep::new(0.31, 0.4);
const CARD_EDGE: Tone = Tone {
    light: ToneStep::new(0.78, 0.8),
    dark: ToneStep::new(0.212, 0.45),
};

/// A grouped card's face on the light ground, by colour: its lightness and its chroma.
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
fn face_in(color: PaletteColor) -> String {
    let (lightness, chroma) = light_face(color);
    toned(
        &semantic_token(color),
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
pub fn card_look(body_color: Option<PaletteColor>, palette: &Palette) -> SlabLook {
    SlabLook {
        face: body_color.map_or_else(|| palette.slab_face.to_owned(), face_in),
        ground: Some(palette.slab_face.to_owned()),
        lit: None,
        edge: semantic_ink(body_color).map_or_else(
            || palette.slab_edge.to_owned(),
            |ink| toned(&ink, CARD_EDGE),
        ),
        thickness: CARD_THICKNESS,
        radius: SLAB_RADIUS,
        sheen: true,
    }
}

/// A relationship's or a message's label: a low tile, its face the plate its words are read on.
pub fn label_look(palette: &Palette) -> SlabLook {
    SlabLook {
        face: palette.pill.to_owned(),
        ground: None,
        lit: None,
        edge: mixed(palette.pill, palette.slab_deep, LABEL_EDGE),
        thickness: PILL_THICKNESS,
        radius: PILL_RADIUS,
        sheen: false,
    }
}

/// The floor of a tray nested in some containers: a step deeper for each.
fn floor_at(depth: f64, palette: &Palette) -> String {
    let sink = Share {
        light: js::js_min(TRAY_SINK_MAX.light, depth * TRAY_SINK.light),
        dark: js::js_min(TRAY_SINK_MAX.dark, depth * TRAY_SINK.dark),
    };
    tinted(palette.tray_floor, Some(palette.tray_sink), sink)
}

/// A container's tray: a neutral well with a header slab made of what holds it.
pub fn tray_look(header: Rect, palette: &Palette, depth: f64) -> TrayLook {
    let floor = floor_at(depth, palette);
    let ground = if depth == 0.0 {
        palette.background.to_owned()
    } else {
        floor_at(depth - 1.0, palette)
    };
    TrayLook {
        top_wall: tinted(&floor, Some(palette.slab_deep), TOP_WALL),
        side_wall: tinted(&floor, Some(palette.slab_deep), SIDE_WALL),
        floor,
        header,
        header_look: SlabLook {
            edge: tinted(&ground, Some(palette.slab_deep), TOP_WALL),
            face: ground,
            ground: None,
            lit: None,
            thickness: CARD_THICKNESS,
            radius: SLAB_RADIUS,
            sheen: false,
        },
    }
}

/// Applied channels for browser inspection of the actual drawing.
pub fn appearance_attributes(appearance: &NodeAppearance) -> Attrs {
    attrs! {
        "data-depiction": if appearance.container { "container" } else { "card" },
        "data-body-color": appearance.body_color.map_or("neutral", PaletteColor::as_str),
        "data-group": appearance.group.as_deref(),
        "data-type-color": appearance.type_color.map_or("neutral", PaletteColor::as_str),
        "data-type-name": appearance.type_name.as_str(),
        "data-type-kind": appearance.type_kind.as_str(),
    }
}

/// One type chip, a small tile raised off the face it sits on; on a removed
/// part a flat, see-through tile under its glyph.
pub fn type_chip(
    x: f64,
    y: f64,
    appearance: &NodeAppearance,
    palette: &Palette,
    standing: Option<Standing>,
    icons: &BTreeMap<String, Vec<String>>,
) -> Markup {
    let ink = semantic_ink(appearance.type_color).unwrap_or_else(|| palette.glyph.to_owned());
    let rect = Rect {
        x,
        y,
        width: ICON_CHIP_SIZE,
        height: ICON_CHIP_SIZE,
    };
    let glyph = glyph_group(
        &appearance.icon,
        x + ICON_CHIP_SIZE / 2.0,
        y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2.0,
        &ink,
        icons,
    );
    if standing == Some(Standing::Removed) {
        return concat(vec![
            tag(
                "rect",
                attrs! {
                    "x": x,
                    "y": y,
                    "width": ICON_CHIP_SIZE,
                    "height": ICON_CHIP_SIZE,
                    "rx": ICON_CHIP_RADIUS,
                }
                .with(ghost_face(palette)),
            ),
            glyph,
        ]);
    }
    concat(vec![chip_tile(rect, &ink, palette), glyph])
}

/// A type chip's tile without its glyph, and the shadow it casts.
pub fn chip_tile(rect: Rect, ink: &str, palette: &Palette) -> Markup {
    let look = SlabLook {
        face: inked_over(palette.slab_face, ink, CHIP_FACE),
        ground: None,
        lit: None,
        edge: inked_over(palette.slab_edge, ink, CHIP_EDGE),
        thickness: CHIP_THICKNESS,
        radius: ICON_CHIP_RADIUS,
        sheen: true,
    };
    concat(vec![
        slab_shadow(rect, ICON_CHIP_RADIUS, Lift::Chip, palette, None),
        slab(rect, &look, palette, None, None),
    ])
}
