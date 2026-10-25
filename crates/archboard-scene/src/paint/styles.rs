//! What each drawn thing looks like: a line's dash says what sort of
//! relationship it is and its weight how much attention the author asked for.
//! Every bundle that sets a size also sets the face that measured the string.

use crate::attrs;
use crate::drawing::Emphasis;
use crate::markup::Attrs;
use crate::paint::appearance::semantic_ink;
use crate::paint::colour::{Share, tinted};
use crate::paint::design::{
    LINE_STRENGTH_DARK, LINE_STRENGTH_LIGHT, NOTE_SIZE, PART_NOTE_SIZE, PART_TITLE_SIZE,
    PILL_TEXT_SIZE,
};
use crate::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT, PILL_FONT, font_attributes};
use crate::paint::palette::Palette;
use crate::paint::standing::ink_of;
use crate::request::{Arrowhead, Dash, LineAppearance, Standing};

/// Every weight, loudest first.
pub const WEIGHTS: [Emphasis; 3] = [Emphasis::Hero, Emphasis::Normal, Emphasis::Muted];

impl Emphasis {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            Emphasis::Hero => "hero",
            Emphasis::Normal => "normal",
            Emphasis::Muted => "muted",
        }
    }
}

/// How thick a line of each weight is drawn.
pub fn stroke_width(weight: Emphasis) -> f64 {
    match weight {
        Emphasis::Hero => 2.2,
        Emphasis::Normal | Emphasis::Muted => 1.4,
    }
}

/// How long an arrowhead of each weight is, from its base to its tip.
pub const HEAD_LENGTH: f64 = 11.0;

/// How big an arrowhead of a weight is drawn, in widths of its line.
pub fn head_widths(weight: Emphasis) -> f64 {
    HEAD_LENGTH / stroke_width(weight)
}

/// The two forms of arrowhead a line can end in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Head {
    /// A solid head, whose tip reaches a little past the end of its line.
    Filled,
    /// An open head, whose tip lies at the end of its line.
    Open,
}

impl Head {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            Head::Filled => "filled",
            Head::Open => "open",
        }
    }

    /// The head a line's appearance ends in, or none.
    pub fn of(arrowhead: Arrowhead) -> Option<Head> {
        match arrowhead {
            Arrowhead::Filled => Some(Head::Filled),
            Arrowhead::Open => Some(Head::Open),
            Arrowhead::None => None,
        }
    }
}

/// Where on its ten-unit drawing each head sits on the end of its line.
pub fn head_ref_x(head: Head) -> f64 {
    match head {
        Head::Filled => 8.0,
        Head::Open => 10.0,
    }
}

/// How far an arrowhead's tip lies past the end of its line.
pub fn head_reach(head: Head) -> f64 {
    ((10.0 - head_ref_x(head)) / 10.0) * HEAD_LENGTH
}

/// How far back from the end of its line an arrowhead's base lies.
pub fn head_base(head: Head) -> f64 {
    (head_ref_x(head) / 10.0) * HEAD_LENGTH
}

/// The ink a line and its arrowhead are drawn in.
pub fn line_colour(palette: &Palette, standing: Option<Standing>) -> String {
    drawn_ink(
        full_line_colour(palette, standing),
        palette,
        Emphasis::Normal,
    )
}

/// The colour a line stands for at full strength: the standing's, or the neutral ink.
pub fn full_line_colour(palette: &Palette, standing: Option<Standing>) -> &'static str {
    ink_of(standing, palette).unwrap_or(palette.edge)
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
pub fn quietened(ink: &str, palette: &Palette, weight: Emphasis) -> String {
    if weight == Emphasis::Muted {
        tinted(palette.background, Some(ink), MUTED_STRENGTH)
    } else {
        ink.to_owned()
    }
}

/// The colour a line is drawn in, from the colour it stands for.
pub fn drawn_ink(ink: &str, palette: &Palette, weight: Emphasis) -> String {
    if ink == palette.standing_removed {
        return tinted(palette.background, Some(ink), REMOVED_STRENGTH);
    }
    let line = if ink == palette.edge {
        ink.to_owned()
    } else {
        tinted(palette.background, Some(ink), LINE_STRENGTH)
    };
    quietened(&line, palette, weight)
}

/// The colour a relationship stands for at full strength.
pub fn relationship_ink(
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
) -> String {
    ink_of(standing, palette)
        .map(str::to_owned)
        .or_else(|| semantic_ink(appearance.color))
        .unwrap_or_else(|| palette.edge.to_owned())
}

/// The marker reference for one arrowhead, in the ink of the line's standing.
pub fn marker_for(weight: Emphasis, head: Head, standing: Option<Standing>) -> String {
    let marked = match standing {
        None | Some(Standing::Unchanged) => String::new(),
        Some(standing) => format!("-{}", standing.as_str()),
    };
    format!("url(#ah-{}-{}{marked})", head.as_str(), weight.as_str())
}

/// The suffix of the arrowhead drawn in the selection's ink, for a lit line.
pub const LIT_HEAD: &str = "-lit";

/// How a line of each dash is broken.
pub fn dash_array(dash: Dash) -> Option<&'static str> {
    match dash {
        Dash::Solid => None,
        Dash::Dashed => Some("6 4"),
        Dash::Dotted => Some("1.5 3.5"),
    }
}

/// How one relationship's line is stroked.
pub fn edge_attributes(
    weight: Emphasis,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &LineAppearance,
) -> Attrs {
    attrs! {
        "fill": "none",
        "stroke": drawn_ink(&relationship_ink(palette, standing, appearance), palette, weight),
        "stroke-width": stroke_width(weight),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": dash_array(appearance.dash),
    }
}

/// Every attribute bundle the painter reaches for, resolved against one palette.
#[derive(Debug)]
pub struct Styles<'p> {
    palette: &'p Palette,
}

impl<'p> Styles<'p> {
    /// The attribute bundles resolved against one palette.
    pub fn of(palette: &'p Palette) -> Self {
        Styles { palette }
    }

    /// A flow's heading, set as a container's header is.
    pub fn header_name(&self) -> Attrs {
        attrs! { "font-size": PART_TITLE_SIZE, "fill": self.palette.foreground }
            .with(font_attributes(CARD_TITLE_FONT))
    }

    /// The responsibility under a container's or a flow's heading, set small and muted.
    pub fn header_note(&self) -> Attrs {
        attrs! { "font-size": PART_NOTE_SIZE, "fill": self.palette.muted }
            .with(font_attributes(CARD_NOTE_FONT))
    }

    /// A card's name, in the title face; its size is left to the caller.
    pub fn title(&self) -> Attrs {
        attrs! { "fill": self.palette.foreground }.with(font_attributes(CARD_TITLE_FONT))
    }

    /// A card's responsibility or a step's note, set small and muted.
    pub fn note(&self) -> Attrs {
        attrs! { "font-size": NOTE_SIZE, "fill": self.palette.muted }
            .with(font_attributes(CARD_NOTE_FONT))
    }

    /// The words on a label plate.
    pub fn pill_text(&self) -> Attrs {
        attrs! { "font-size": PILL_TEXT_SIZE, "fill": self.palette.pill_text }
            .with(font_attributes(PILL_FONT))
    }

    /// The ring round whatever the person has selected, unfilled.
    pub fn halo(&self) -> Attrs {
        attrs! { "fill": "none", "stroke": self.palette.selection }
    }
}
