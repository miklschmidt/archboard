//! The symbol a legend entry stands beside: a comparison's pin, a part kind's
//! chip, a relationship's line and head, and the two things a line says beside
//! its kind, its emphasis and its traffic, each drawn as the picture draws it.

use crate::attrs;
use crate::drawing::Emphasis;
use crate::geometry::{Rect, coord};
use crate::js;
use crate::markup::{Attrs, Markup, group, lines, tag, wrap};
use crate::paint::appearance::{chip_tile, semantic_ink};
use crate::paint::design::{CHIP_THICKNESS, ICON_CHIP_SIZE};
use crate::paint::legend_entries::{Applied, Entry, Keys};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_pin_at;
use crate::paint::styles::{HEAD_LENGTH, dash_array, drawn_ink, stroke_width};
use crate::paint::traffic::pulse_look;
use crate::request::{Dash, PaletteColor};
use crate::scene::Role;

/// The height of one legend row.
pub(super) const ROW: f64 = 28.0;
/// The width of the symbol at the start of a legend row.
pub(super) const GLYPH: f64 = 30.0;
const PULSE_STOPS: [(f64, f64); 6] = [
    (0.0, 0.0),
    (0.35, 0.05),
    (0.6, 0.2),
    (0.78, 0.5),
    (0.9, 1.0),
    (1.0, 0.0),
];
const PULSE_SPAN: f64 = 40.0;
const PULSE_GLOW: f64 = 3.0;

/// A round-capped stroke across a symbol's row, stopping `end` short of its right edge.
fn line_at(x: f64, y: f64, attributes: Attrs, end: f64) -> Markup {
    tag(
        "path",
        attrs! {
            "d": format!("M{} {}H{}", coord(x + 1.0), coord(y + ROW / 2.0), coord(x + GLYPH - end)),
            "fill": "none",
            "stroke-linecap": "round",
        }
        .with(attributes),
    )
}

/// The dash array of a relationship's dash, as its appearance spells it; none for a solid line.
fn dash_of(word: &str) -> Option<&'static str> {
    match word {
        "dashed" => dash_array(Dash::Dashed),
        "dotted" => dash_array(Dash::Dotted),
        _ => None,
    }
}

/// A relationship kind's symbol: a short line in its ink and dash, with its arrowhead.
fn relationship_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Markup {
    let named = semantic_ink(PaletteColor::named(&applied.line_color));
    let ink = drawn_ink(
        named.as_deref().unwrap_or(palette.edge),
        palette,
        Emphasis::Normal,
    );
    let head = HEAD_LENGTH;
    let filled = applied.arrowhead == "filled";
    let headed = filled || applied.arrowhead == "open";
    let tip = x + GLYPH - 1.0;
    let shape = if filled {
        tag(
            "path",
            attrs! { "d": "M0 0L10 5L0 10Z", "fill": ink.as_str() },
        )
    } else {
        tag(
            "path",
            attrs! {
                "d": "M2 1L10 5L2 9",
                "fill": "none",
                "stroke": ink.as_str(),
                "stroke-width": 1.7,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        )
    };
    lines(vec![
        line_at(
            x,
            y,
            attrs! {
                "stroke": ink.as_str(),
                "stroke-width": stroke_width(Emphasis::Normal),
                "stroke-dasharray": dash_of(&applied.dash),
            },
            if filled { 1.0 + head / 2.0 } else { 1.0 },
        ),
        if headed {
            wrap(
                "svg",
                attrs! {
                    "x": coord(tip - head),
                    "y": coord(y + ROW / 2.0 - head / 2.0),
                    "width": head,
                    "height": head,
                    "viewBox": "0 0 10 10",
                },
                shape,
            )
        } else {
            Markup::new()
        },
    ])
}

/// A part kind's symbol: its type chip in the kind's ink, with its icon.
fn kind_symbol(applied: &Applied, palette: &Palette, x: f64, y: f64) -> Markup {
    let named = semantic_ink(PaletteColor::named(&applied.type_color));
    let ink = named.unwrap_or_else(|| palette.glyph.to_owned());
    let rect = Rect {
        x: x + (GLYPH - ICON_CHIP_SIZE) / 2.0,
        y: y + (ROW - ICON_CHIP_SIZE) / 2.0,
        width: ICON_CHIP_SIZE,
        height: ICON_CHIP_SIZE,
    };
    let glyph = group(
        Role::Icon,
        None,
        attrs! {
            "transform": format!(
                "translate({},{})",
                coord(rect.x + ICON_CHIP_SIZE / 2.0 - 9.0),
                coord(rect.y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2.0 - 9.0)
            ),
        },
        applied.icon.iter().cloned().collect(),
    );
    let mut symbol = chip_tile(rect, &ink, palette);
    symbol.extend(glyph);
    symbol
}

/// A line drawn with more emphasis.
fn emphasis_symbol(palette: &Palette, x: f64, y: f64) -> Markup {
    line_at(
        x,
        y,
        attrs! {
            "stroke": drawn_ink(palette.edge, palette, Emphasis::Hero),
            "stroke-width": stroke_width(Emphasis::Hero),
        },
        1.0,
    )
}

/// A line with a pulse on it, held still.
fn traffic_symbol(palette: &Palette, x: f64, y: f64) -> Markup {
    let plain = attrs! {
        "stroke": drawn_ink(palette.edge, palette, Emphasis::Normal),
        "stroke-width": stroke_width(Emphasis::Normal),
    };
    let light = pulse_look(palette.edge, stroke_width(Emphasis::Normal), palette).head;
    let front = x + GLYPH / 2.0 + PULSE_SPAN / 2.0;
    let run = format!(
        "M{} {}H{}",
        coord(front - PULSE_SPAN),
        coord(y + ROW / 2.0),
        coord(front)
    );
    let gradient = wrap(
        "linearGradient",
        attrs! {
            "id": "export-legend-pulse",
            "gradientUnits": "userSpaceOnUse",
            "x1": coord(front - PULSE_SPAN),
            "x2": coord(front),
            "y1": 0.0,
            "y2": 0.0,
        },
        PULSE_STOPS
            .iter()
            .flat_map(|(offset, opacity)| {
                tag("stop", attrs! { "offset": *offset, "stop-color": light.as_str(), "stop-opacity": *opacity })
            })
            .collect(),
    );
    wrap(
        "svg",
        attrs! {
            "x": coord(x),
            "y": coord(y),
            "width": GLYPH,
            "height": ROW,
            "viewBox": format!("{} {} {} {}", coord(x), coord(y), js::number(GLYPH), js::number(ROW)),
        },
        lines(vec![
            wrap("defs", attrs! {}, gradient),
            line_at(x, y, plain, 1.0),
            tag(
                "path",
                attrs! {
                    "d": run.as_str(),
                    "fill": "none",
                    "stroke": "url(#export-legend-pulse)",
                    "stroke-opacity": 0.25,
                    "stroke-width": stroke_width(Emphasis::Normal) + 0.6 + PULSE_GLOW,
                },
            ),
            tag(
                "path",
                attrs! {
                    "d": run.as_str(),
                    "fill": "none",
                    "stroke": "url(#export-legend-pulse)",
                    "stroke-width": stroke_width(Emphasis::Normal) + 0.6,
                },
            ),
        ]),
    )
}

/// The symbol an entry stands beside.
pub(super) fn symbol_of(entry: &Entry, palette: &Palette, x: f64, y: f64) -> Markup {
    match &entry.keys {
        Keys::Mark(standing, _) => {
            standing_pin_at(x + GLYPH / 2.0, y + ROW / 2.0, Some(*standing), palette)
        }
        Keys::Kind(applied) => kind_symbol(applied, palette, x, y),
        Keys::Relationship(applied) => relationship_symbol(applied, palette, x, y),
        Keys::Emphasis => emphasis_symbol(palette, x, y),
        Keys::Traffic => traffic_symbol(palette, x, y),
    }
}
