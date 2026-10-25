//! How a variant's subjects are drawn against the variant it is read against.
//!
//! Nothing here is authored and nothing is stored: the host hands one render
//! the standing of each subject, and this is the whole of what it does to the
//! picture. Three channels say it: a pin on the subject's top-left corner, a
//! removed subject ghosted, and the block's outline (a swipe under a line). A
//! reconciliation nobody has decided yet is a warning triangle on the top-right
//! corner, which is not a standing.

use std::collections::{BTreeMap, HashSet};

use crate::attrs;
use crate::geometry::{Point, Rect, coord, union};
use crate::markup::{Markup, concat, group, tag};
use crate::paint::palette::Palette;
use crate::request::Standing;
use crate::scene::{Role, Subject, SubjectKind};

/// How far in from a subject's corner its pin sits, and how big the pin is.
pub const PIN_INSET: f64 = 3.0;
const PIN_RADIUS: f64 = 9.2;
const PIN_STROKE: f64 = 1.7;
/// The rim of the page's ground round a pin.
const PIN_RIM: f64 = 1.5;

/// What a ghosted line's ink is worth.
const GHOST_OPACITY: f64 = 0.7;

/// How heavy the border a standing draws round a block's top face is.
pub const OUTLINE_WIDTH: f64 = 1.8;

/// The texture of a standing's border: solid for added, dashed for changed and removed.
pub fn outline_dash(standing: Standing) -> Option<&'static str> {
    match standing {
        Standing::Removed | Standing::Changed => Some("7 3.5"),
        Standing::Added | Standing::Unchanged => None,
    }
}

/// How much wider than its line a standing's swipe is drawn.
const SWIPE_EXTRA: f64 = 4.0;

/// The mark each standing wears, drawn in a ten-unit square about the origin.
fn pin_glyph(standing: Standing) -> &'static str {
    match standing {
        Standing::Added => "M-2.5,0 H2.5 M0,-2.5 V2.5",
        Standing::Removed => "M-2.7,0 H2.7",
        Standing::Changed => "M-2.9,0.9 Q-1.45,-2 0,0 Q1.45,2 2.9,-0.9",
        Standing::Unchanged => "",
    }
}

/// How solid a swipe is.
const SWIPE_OPACITY: f64 = 0.32;

/// The ink one standing is drawn in, or none for a subject that stands unchanged.
fn standing_ink(standing: Standing, palette: &Palette) -> Option<&'static str> {
    match standing {
        Standing::Added => Some(palette.standing_added),
        Standing::Removed => Some(palette.standing_removed),
        Standing::Changed => Some(palette.standing_changed),
        Standing::Unchanged => None,
    }
}

/// The ink of a standing that may not be stated.
pub fn ink_of(standing: Option<Standing>, palette: &Palette) -> Option<&'static str> {
    standing.and_then(|standing| standing_ink(standing, palette))
}

/// How the subjects of a picture stand: none at all when the picture is not a
/// proposal, and unchanged for an id the host did not mention when it is.
#[derive(Clone, Debug, Default)]
pub struct Standings(Option<BTreeMap<String, Standing>>);

impl Standings {
    /// The standings the host stated, or none.
    pub fn from(stated: Option<&BTreeMap<String, Standing>>) -> Self {
        Standings(stated.cloned())
    }

    /// How one subject stands.
    pub fn of(&self, id: &str) -> Option<Standing> {
        self.0
            .as_ref()
            .map(|stated| stated.get(id).copied().unwrap_or(Standing::Unchanged))
    }
}

/// Which subjects the board says nobody has decided yet.
#[derive(Clone, Debug, Default)]
pub struct Unsettled(HashSet<String>);

impl Unsettled {
    /// The subjects the host stated.
    pub fn from(stated: &[String]) -> Self {
        Unsettled(stated.iter().cloned().collect())
    }

    /// Whether one subject is undecided.
    pub fn of(&self, id: &str) -> bool {
        self.0.contains(id)
    }
}

/// The attribute a relationship's traffic layer carries, naming the relationship.
pub const TRAFFIC_ATTRIBUTE: &str = "data-traffic";
/// The attribute on a mark that stands with the subjects it lists.
pub const MEMBERS_ATTRIBUTE: &str = "data-members";
/// The attribute on the group that holds one flow's row of participant cards.
pub const HEAD_ATTRIBUTE: &str = "data-flow-head";
/// The attribute on a group that draws one part of a subject drawn in two.
pub const PART_ATTRIBUTE: &str = "data-semantic-part";

/// The subject a drawn group carries: what it is, which it is, how it stands.
pub fn subject(kind: SubjectKind, id: &str, standing: Option<Standing>) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
        standing,
    }
}

/// The opacity a removed line's group takes, or none for a line still on the proposal.
pub fn ghost_opacity(standing: Option<Standing>) -> Option<f64> {
    (standing == Some(Standing::Removed)).then_some(GHOST_OPACITY)
}

/// The colours a subject's own words are drawn with: a removed block's names
/// and notes are faded to the secondary ink.
pub fn standing_palette(palette: &Palette, standing: Option<Standing>) -> Palette {
    if standing == Some(Standing::Removed) {
        Palette {
            foreground: palette.muted,
            pill_text: palette.muted,
            ..*palette
        }
    } else {
        *palette
    }
}

/// Whether a subject of some standing wears a pin in its corner.
fn draws_pin(standing: Option<Standing>) -> bool {
    standing.is_some_and(|standing| !pin_glyph(standing).is_empty())
}

/// The pin on a subject's top-left corner.
pub fn standing_pin(rect: Rect, standing: Option<Standing>, palette: &Palette) -> Markup {
    standing_pin_at(rect.x + PIN_INSET, rect.y + PIN_INSET, standing, palette)
}

/// The pin, centred on a point.
pub fn standing_pin_at(x: f64, y: f64, standing: Option<Standing>, palette: &Palette) -> Markup {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Markup::new();
    };
    group(
        Role::Pin,
        None,
        attrs! { "transform": format!("translate({},{})", coord(x), coord(y)) },
        concat(vec![
            tag(
                "circle",
                attrs! {
                    "r": PIN_RADIUS,
                    "fill": ink,
                    "stroke": palette.background,
                    "stroke-width": PIN_RIM,
                },
            ),
            tag(
                "path",
                attrs! {
                    "d": pin_glyph(standing),
                    "fill": "none",
                    "stroke": palette.background,
                    "stroke-width": PIN_STROKE,
                    "stroke-linecap": "round",
                },
            ),
        ]),
    )
}

/// The swipe laid under a line that stands for something.
pub fn standing_swipe(
    path: &str,
    width: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Markup {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Markup::new();
    };
    tag(
        "path",
        attrs! {
            "d": path,
            "fill": "none",
            "stroke": ink,
            "stroke-width": width + SWIPE_EXTRA,
            "stroke-opacity": SWIPE_OPACITY,
            "stroke-linecap": "butt",
            "stroke-linejoin": "round",
            "stroke-dasharray": outline_dash(standing),
        },
    )
}

const BADGE_SIDE: f64 = 5.4;
const BADGE_ABOVE: f64 = 5.2;
const BADGE_BELOW: f64 = 4.4;
const BADGE_GLYPH: &str = "M0,-5.2 L5.4,4.4 H-5.4 Z";
const BADGE_BANG_AND_DOT: &str = "M0,-2.4 V0.9 M0,2.6 V2.9";

/// The warning mark, centred where it was put.
fn warning_mark(x: f64, y: f64, palette: &Palette) -> Markup {
    group(
        Role::Warning,
        None,
        attrs! {
            "transform": format!("translate({},{})", coord(x), coord(y)),
            "pointer-events": "none",
        },
        concat(vec![
            tag("path", attrs! { "d": BADGE_GLYPH, "fill": palette.warning }),
            tag(
                "path",
                attrs! {
                    "d": BADGE_BANG_AND_DOT,
                    "fill": "none",
                    "stroke": palette.background,
                    "stroke-width": PIN_STROKE,
                    "stroke-linecap": "round",
                },
            ),
        ]),
    )
}

/// The warning on a box's top-right corner.
pub fn warning_badge(rect: Rect, unsettled: bool, palette: &Palette) -> Markup {
    if !unsettled {
        return Markup::new();
    }
    warning_mark(rect.x + rect.width - PIN_INSET, rect.y + PIN_INSET, palette)
}

/// What a subject's box and the marks on its corners cover, which the page must hold.
pub fn marked_box(rect: Rect, standing: Option<Standing>, unsettled: bool) -> Rect {
    let pin = Rect {
        x: rect.x + PIN_INSET - PIN_RADIUS,
        y: rect.y + PIN_INSET - PIN_RADIUS,
        width: 2.0 * PIN_RADIUS,
        height: 2.0 * PIN_RADIUS,
    };
    let badge = Rect {
        x: rect.x + rect.width - PIN_INSET - BADGE_SIDE,
        y: rect.y + PIN_INSET - BADGE_ABOVE,
        width: 2.0 * BADGE_SIDE,
        height: BADGE_ABOVE + BADGE_BELOW,
    };
    let mut boxes = vec![rect];
    if draws_pin(standing) {
        boxes.push(pin);
    }
    if unsettled {
        boxes.push(badge);
    }
    union(boxes).unwrap_or(rect)
}

/// The warning on a line, at the leading edge of its words.
pub fn warning_on_line(at: Option<Point>, unsettled: bool, palette: &Palette) -> Markup {
    match at {
        Some(at) if unsettled => warning_mark(at.x, at.y, palette),
        _ => Markup::new(),
    }
}
