//! The marks a viewer draws beside a picture, as the painter draws them in it:
//! the weight of a line, its arrowhead, its ink and its pulse's ink by its
//! colour, its dash, the effect each dash says, a standing's pin, and the
//! warning on a subject nobody has decided.
//! A frontend that draws a key, a pin or a warning of its own reads them here,
//! so it never holds a copy of the painter's rules.

use crate::drawing::Emphasis;
use crate::paint::edge_line::OPEN_ARM;
use crate::paint::palette::Palette;
use crate::paint::standing::{PIN_INSET, standing_pin_at, warning_glyph};
use crate::paint::styles::{HEAD_LENGTH, WEIGHTS, dash_array, drawn_ink, quietened, stroke_width};
use crate::paint::traffic::pulse_look;
use crate::request::{Dash, LineEffect, PaletteColor, Standing};
use crate::scene::traffic::pulse_breadth;
use crate::scene::{Colour, Item};

/// Every colour a relationship kind can be drawn in: none, for the neutral line, then the palette's.
const COLOURS: [Option<PaletteColor>; 19] = [
    None,
    Some(PaletteColor::Red),
    Some(PaletteColor::Orange),
    Some(PaletteColor::Amber),
    Some(PaletteColor::Yellow),
    Some(PaletteColor::Lime),
    Some(PaletteColor::Green),
    Some(PaletteColor::Emerald),
    Some(PaletteColor::Teal),
    Some(PaletteColor::Slate),
    Some(PaletteColor::Cyan),
    Some(PaletteColor::Sky),
    Some(PaletteColor::Blue),
    Some(PaletteColor::Indigo),
    Some(PaletteColor::Violet),
    Some(PaletteColor::Purple),
    Some(PaletteColor::Fuchsia),
    Some(PaletteColor::Pink),
    Some(PaletteColor::Rose),
];

/// The marks a viewer draws beside a picture.
#[derive(Clone, Debug, PartialEq)]
pub struct ViewerMarks {
    /// How wide a line of each weight is drawn.
    pub line_widths: Vec<(Emphasis, f64)>,
    /// How long an arrowhead is from its base to its tip, at every weight; it is as wide.
    pub head_length: f64,
    /// How thick an open arrowhead's arms are, in the ten-unit square it is drawn in.
    pub open_arm: f64,
    /// How thick a pulse's core is on a line of no emphasis.
    pub pulse_breadth: f64,
    /// The ink a line of each colour is drawn in; none is the neutral line.
    pub line_inks: Vec<(Option<PaletteColor>, Colour)>,
    /// The ink of the body of a pulse on a line of each colour.
    pub pulse_inks: Vec<(Option<PaletteColor>, Colour)>,
    /// The pin each standing wears, centred on the origin; none for unchanged.
    pub pins: Vec<(Standing, Vec<Item>)>,
    /// The warning's marks, centred on the origin.
    pub warning: Vec<Item>,
    /// How far in from a box's corner its pin and its warning stand.
    pub corner_inset: f64,
    /// How a line of each dash is broken: lengths drawn and left, in turn.
    pub dashes: Vec<(Dash, &'static [f64])>,
    /// The effect key: what each line effect is called and its dash, in the key's order.
    pub effects: Vec<(LineEffect, &'static str, Dash)>,
}

/// The marks a viewer draws beside a picture, from the painter's own rules.
pub fn viewer_marks() -> ViewerMarks {
    let palette = Palette::of_page();
    let line_widths = WEIGHTS
        .iter()
        .map(|weight| (*weight, stroke_width(*weight)))
        .collect();
    let full =
        |color: Option<PaletteColor>| color.map_or_else(|| palette.edge.clone(), Colour::palette);
    let line_inks = COLOURS
        .iter()
        .map(|color| (*color, drawn_ink(&full(*color), &palette, Emphasis::Normal)))
        .collect();
    let pulse_inks = COLOURS
        .iter()
        .map(|color| {
            let ink = quietened(&full(*color), &palette, Emphasis::Normal);
            let look = pulse_look(&ink, stroke_width(Emphasis::Normal), &palette);
            (*color, look.head)
        })
        .collect();
    let pins = [
        Standing::Added,
        Standing::Changed,
        Standing::Removed,
        Standing::Unchanged,
    ]
    .into_iter()
    .map(|standing| {
        (
            standing,
            standing_pin_at(0.0, 0.0, Some(standing), &palette),
        )
    })
    .collect();
    ViewerMarks {
        line_widths,
        head_length: HEAD_LENGTH,
        open_arm: OPEN_ARM,
        pulse_breadth: pulse_breadth(stroke_width(Emphasis::Normal)),
        line_inks,
        pulse_inks,
        dashes: [Dash::Solid, Dash::Dashed, Dash::Dotted, Dash::Declared]
            .into_iter()
            .map(|dash| (dash, dash_array(dash)))
            .collect(),
        effects: LineEffect::ALL
            .into_iter()
            .map(|effect| (effect, effect.words(), effect.dash()))
            .collect(),
        pins,
        warning: warning_glyph(&palette),
        corner_inset: PIN_INSET,
    }
}
