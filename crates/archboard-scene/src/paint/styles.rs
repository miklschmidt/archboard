//! What each drawn thing looks like: a line's dash says what sort of
//! relationship it is and its weight how much attention the author asked for.
//! Every lettering that sets a size also sets the face that measured the string.

use crate::drawing::{DiagramFont, Emphasis};
use crate::geometry::Point;
use crate::paint::appearance::semantic_ink;
use crate::paint::colour::{Share, tinted};
use crate::paint::design::{
    CARD_NOTE_FONT, CARD_TITLE_FONT, LINE_STRENGTH_DARK, LINE_STRENGTH_LIGHT, NOTE_SIZE,
    PART_NOTE_SIZE, PART_TITLE_SIZE, PILL_FONT, PILL_TEXT_SIZE,
};
use crate::paint::palette::Palette;
use crate::paint::standing::ink_of;
use crate::request::{Arrowhead, Dash, LineAppearance, Standing};
use crate::scene::{Colour, Head, HeadInk, MarkerId, Paint, Shape, Stroke, Text};

/// Every weight, loudest first.
pub(super) const WEIGHTS: [Emphasis; 3] = [Emphasis::Hero, Emphasis::Normal, Emphasis::Muted];

/// How thick a line of each weight is drawn.
pub(super) fn stroke_width(weight: Emphasis) -> f64 {
    match weight {
        Emphasis::Hero => 2.2,
        Emphasis::Normal | Emphasis::Muted => 1.4,
    }
}

/// How long an arrowhead of each weight is, from its base to its tip.
pub(super) const HEAD_LENGTH: f64 = 11.0;

/// How big an arrowhead of a weight is drawn, in widths of its line.
pub(super) fn head_widths(weight: Emphasis) -> f64 {
    HEAD_LENGTH / stroke_width(weight)
}

/// The head a line's appearance ends in, or none.
pub(super) fn head_of(arrowhead: Arrowhead) -> Option<Head> {
    match arrowhead {
        Arrowhead::Filled => Some(Head::Filled),
        Arrowhead::Open => Some(Head::Open),
        Arrowhead::None => None,
    }
}

/// Where on its ten-unit drawing each head sits on the end of its line.
pub(super) fn head_ref_x(head: Head) -> f64 {
    match head {
        Head::Filled => 8.0,
        Head::Open => 10.0,
    }
}

/// How far an arrowhead's tip lies past the end of its line.
pub(super) fn head_reach(head: Head) -> f64 {
    ((10.0 - head_ref_x(head)) / 10.0) * HEAD_LENGTH
}

/// How far back from the end of its line an arrowhead's base lies.
pub(super) fn head_base(head: Head) -> f64 {
    (head_ref_x(head) / 10.0) * HEAD_LENGTH
}

/// The ink a line and its arrowhead are drawn in.
pub(super) fn line_colour(palette: &Palette, standing: Option<Standing>) -> Colour {
    drawn_ink(
        full_line_colour(palette, standing),
        palette,
        Emphasis::Normal,
    )
}

/// The colour a line stands for at full strength: the standing's, or the neutral ink.
pub(super) fn full_line_colour(palette: &Palette, standing: Option<Standing>) -> &Colour {
    ink_of(standing, palette).unwrap_or(&palette.edge)
}

const REMOVED_STRENGTH: Share = Share {
    light: 0.85,
    dark: 1.0,
};
const MUTED_STRENGTH: Share = Share {
    light: 0.7,
    dark: 0.6,
};
const LINE_STRENGTH: Share = Share {
    light: LINE_STRENGTH_LIGHT,
    dark: LINE_STRENGTH_DARK,
};

/// A colour as a line of one weight carries it: a muted line's with some of the page mixed in.
pub(super) fn quietened(ink: &Colour, palette: &Palette, weight: Emphasis) -> Colour {
    if weight == Emphasis::Muted {
        tinted(&palette.background, Some(ink), MUTED_STRENGTH)
    } else {
        ink.clone()
    }
}

/// The colour a line is drawn in, from the colour it stands for.
pub(super) fn drawn_ink(ink: &Colour, palette: &Palette, weight: Emphasis) -> Colour {
    if *ink == palette.standing_removed {
        return tinted(&palette.background, Some(ink), REMOVED_STRENGTH);
    }
    let line = if *ink == palette.edge {
        ink.clone()
    } else {
        tinted(&palette.background, Some(ink), LINE_STRENGTH)
    };
    quietened(&line, palette, weight)
}

/// The colour a relationship stands for at full strength.
pub(super) fn relationship_ink(
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
) -> Colour {
    ink_of(standing, palette)
        .cloned()
        .or_else(|| semantic_ink(appearance.color))
        .unwrap_or_else(|| palette.edge.clone())
}

/// The arrowhead every line of a weight and a standing shares.
pub(super) fn marker_for(weight: Emphasis, head: Head, standing: Option<Standing>) -> MarkerId {
    let ink = match standing {
        None | Some(Standing::Unchanged) => HeadInk::Neutral,
        Some(Standing::Added) => HeadInk::Added,
        Some(Standing::Changed) => HeadInk::Changed,
        Some(Standing::Removed) => HeadInk::Removed,
    };
    MarkerId::Shared { head, weight, ink }
}

/// How a line of each dash is broken.
pub(super) fn dash_array(dash: Dash) -> &'static [f64] {
    match dash {
        Dash::Solid => &[],
        Dash::Dashed => &[6.0, 4.0],
        Dash::Dotted => &[1.5, 3.5],
    }
}

/// How one relationship's line is stroked.
pub(super) fn edge_stroke(
    weight: Emphasis,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
) -> Stroke {
    Stroke::new(
        drawn_ink(
            &relationship_ink(palette, standing, appearance),
            palette,
            weight,
        ),
        stroke_width(weight),
    )
    .rounded()
    .dashed(dash_array(appearance.dash))
}

/// A face, a size and a colour that words are set in.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Lettering {
    pub font: DiagramFont,
    pub size: f64,
    pub fill: Colour,
}

impl Lettering {
    /// Some words set in this lettering at a point.
    pub(super) fn set(&self, at: Point, words: &str) -> Text {
        Text::set(at, self.font, self.size, self.fill.clone(), words)
    }
}

/// Every lettering and ring the painter reaches for, resolved against one palette.
#[derive(Debug)]
pub(super) struct Styles<'p> {
    palette: &'p Palette,
}

impl<'p> Styles<'p> {
    /// The letterings resolved against one palette.
    pub(super) fn of(palette: &'p Palette) -> Self {
        Styles { palette }
    }

    /// A flow's heading, set as a container's header is.
    pub(super) fn header_name(&self) -> Lettering {
        Lettering {
            font: CARD_TITLE_FONT,
            size: PART_TITLE_SIZE,
            fill: self.palette.foreground.clone(),
        }
    }

    /// The responsibility under a container's or a flow's heading, set small and muted.
    pub(super) fn header_note(&self) -> Lettering {
        Lettering {
            font: CARD_NOTE_FONT,
            size: PART_NOTE_SIZE,
            fill: self.palette.muted.clone(),
        }
    }

    /// A card's name, in the title face, at a size of the caller's.
    pub(super) fn title(&self, size: f64) -> Lettering {
        Lettering {
            font: CARD_TITLE_FONT,
            size,
            fill: self.palette.foreground.clone(),
        }
    }

    /// A card's responsibility or a step's note, set small and muted.
    pub(super) fn note(&self) -> Lettering {
        Lettering {
            font: CARD_NOTE_FONT,
            size: NOTE_SIZE,
            fill: self.palette.muted.clone(),
        }
    }

    /// The words on a label plate.
    pub(super) fn pill_text(&self) -> Lettering {
        Lettering {
            font: PILL_FONT,
            size: PILL_TEXT_SIZE,
            fill: self.palette.pill_text.clone(),
        }
    }

    /// The stroke of the ring round whatever the person has selected.
    pub(super) fn ring(&self, width: Option<f64>) -> Stroke {
        Stroke {
            width,
            ..Stroke::plain(&self.palette.selection)
        }
    }

    /// A shape drawn as the ring round whatever the person has selected:
    /// unfilled, stroked in the selection's ink, the rest of its stroke kept.
    pub(super) fn halo(&self, shape: Shape) -> Shape {
        let stroke = match shape.stroke {
            Some(stroke) => Stroke {
                paint: (&self.palette.selection).into(),
                ..stroke
            },
            None => self.ring(None),
        };
        Shape {
            fill: Some(Paint::None),
            stroke: Some(stroke),
            ..shape
        }
    }
}
