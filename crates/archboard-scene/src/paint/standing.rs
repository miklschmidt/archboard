//! How a variant's subjects are drawn against the variant it is read against.
//!
//! Nothing here is authored and nothing is stored: the host hands one render
//! the standing of each subject, and this is the whole of what it does to the
//! picture. Three channels say it: a pin on the subject's top-left corner, a
//! removed subject ghosted, and the block's outline (a swipe under a line). A
//! reconciliation nobody has decided yet is a warning triangle on the top-right
//! corner, which is not a standing.

use std::collections::{BTreeMap, HashSet};

use crate::geometry::{Point, Rect, round_coord, union};
use crate::paint::build::{Items, concat, grouped, shape};
use crate::paint::palette::Palette;
use crate::request::Standing;
use crate::scene::{
    Cap, Colour, Geometry, Group, PathStep, Pointer, Purpose, Role, Shape, Stroke, Subject,
    SubjectKind, Transform,
};

/// How far in from a subject's corner its pin sits, and how big the pin is.
pub(super) const PIN_INSET: f64 = 3.0;
const PIN_RADIUS: f64 = 9.2;
const PIN_STROKE: f64 = 1.7;
/// The rim of the page's ground round a pin.
const PIN_RIM: f64 = 1.5;

/// What a ghosted line's ink is worth.
const GHOST_OPACITY: f64 = 0.7;

/// How heavy the border a standing draws round a block's top face is.
pub(super) const OUTLINE_WIDTH: f64 = 1.8;

/// The texture of a standing's border: solid for added, dashed for changed and removed.
pub(super) fn outline_dash(standing: Standing) -> &'static [f64] {
    match standing {
        Standing::Removed | Standing::Changed => &[7.0, 3.5],
        Standing::Added | Standing::Unchanged => &[],
    }
}

/// How much wider than its line a standing's swipe is drawn.
const SWIPE_EXTRA: f64 = 4.0;

/// A point of a glyph.
const fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// The mark each standing wears, drawn in a ten-unit square about the origin.
fn pin_glyph(standing: Standing) -> Vec<PathStep> {
    match standing {
        Standing::Added => vec![
            PathStep::Move { to: at(-2.5, 0.0) },
            PathStep::Across { x: 2.5 },
            PathStep::Move { to: at(0.0, -2.5) },
            PathStep::Down { y: 2.5 },
        ],
        Standing::Removed => vec![
            PathStep::Move { to: at(-2.7, 0.0) },
            PathStep::Across { x: 2.7 },
        ],
        Standing::Changed => vec![
            PathStep::Move { to: at(-2.9, 0.9) },
            PathStep::Quad {
                control: at(-1.45, -2.0),
                to: at(0.0, 0.0),
            },
            PathStep::Quad {
                control: at(1.45, 2.0),
                to: at(2.9, -0.9),
            },
        ],
        Standing::Unchanged => Vec::new(),
    }
}

/// How solid a swipe is.
const SWIPE_OPACITY: f64 = 0.32;

/// The ink one standing is drawn in, or none for a subject that stands unchanged.
fn standing_ink(standing: Standing, palette: &Palette) -> Option<&Colour> {
    match standing {
        Standing::Added => Some(&palette.standing_added),
        Standing::Removed => Some(&palette.standing_removed),
        Standing::Changed => Some(&palette.standing_changed),
        Standing::Unchanged => None,
    }
}

/// The ink of a standing that may not be stated.
pub(super) fn ink_of(standing: Option<Standing>, palette: &Palette) -> Option<&Colour> {
    standing.and_then(|standing| standing_ink(standing, palette))
}

/// How the subjects of a picture stand: none at all when the picture is not a
/// proposal, and unchanged for an id the host did not mention when it is.
#[derive(Clone, Debug, Default)]
pub(super) struct Standings(Option<BTreeMap<String, Standing>>);

impl Standings {
    /// The standings the host stated, or none.
    pub(super) fn from(stated: Option<&BTreeMap<String, Standing>>) -> Self {
        Standings(stated.cloned())
    }

    /// How one subject stands.
    pub(super) fn of(&self, id: &str) -> Option<Standing> {
        self.0
            .as_ref()
            .map(|stated| stated.get(id).copied().unwrap_or(Standing::Unchanged))
    }
}

/// Which subjects the board says nobody has decided yet.
#[derive(Clone, Debug, Default)]
pub(super) struct Unsettled(HashSet<String>);

impl Unsettled {
    /// The subjects the host stated.
    pub(super) fn from(stated: &[String]) -> Self {
        Unsettled(stated.iter().cloned().collect())
    }

    /// Whether one subject is undecided.
    pub(super) fn of(&self, id: &str) -> bool {
        self.0.contains(id)
    }
}

/// The subject a drawn group carries: what it is, which it is, how it stands.
pub(super) fn subject(kind: SubjectKind, id: &str, standing: Option<Standing>) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
        standing,
    }
}

/// The opacity a removed line's group takes, or none for a line still on the proposal.
pub(super) fn ghost_opacity(standing: Option<Standing>) -> Option<f64> {
    (standing == Some(Standing::Removed)).then_some(GHOST_OPACITY)
}

/// The colours a subject's own words are drawn with: a removed block's names
/// and notes are faded to the secondary ink.
pub(super) fn standing_palette(palette: &Palette, standing: Option<Standing>) -> Palette {
    if standing == Some(Standing::Removed) {
        Palette {
            foreground: palette.muted.clone(),
            pill_text: palette.muted.clone(),
            ..palette.clone()
        }
    } else {
        palette.clone()
    }
}

/// Whether a subject of some standing wears a pin in its corner.
fn draws_pin(standing: Option<Standing>) -> bool {
    standing.is_some_and(|standing| !pin_glyph(standing).is_empty())
}

/// A mark's group, moved to where it stands.
fn placed_mark(role: Role, x: f64, y: f64, items: Items) -> Group {
    Group::new(role, items).moved(Transform::translate(round_coord(x), round_coord(y)))
}

/// The pin on a subject's top-left corner.
pub(super) fn standing_pin(rect: Rect, standing: Option<Standing>, palette: &Palette) -> Items {
    standing_pin_at(rect.x + PIN_INSET, rect.y + PIN_INSET, standing, palette)
}

/// The pin, centred on a point.
pub(super) fn standing_pin_at(
    x: f64,
    y: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Items {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Items::new();
    };
    grouped(placed_mark(
        Role::Pin,
        x,
        y,
        concat(vec![
            shape(
                Shape::new(
                    Purpose::Line,
                    Geometry::Circle {
                        centre: None,
                        radius: PIN_RADIUS,
                    },
                )
                .filled(ink)
                .stroked(Stroke::new(&palette.background, PIN_RIM)),
            ),
            shape(
                Shape::path(Purpose::Line, pin_glyph(standing))
                    .unfilled()
                    .stroked(Stroke::new(&palette.background, PIN_STROKE).capped(Cap::Round)),
            ),
        ]),
    ))
}

/// The swipe laid under a line that stands for something.
pub(super) fn standing_swipe(
    path: &[PathStep],
    width: f64,
    standing: Option<Standing>,
    palette: &Palette,
) -> Items {
    let (Some(standing), Some(ink)) = (standing, ink_of(standing, palette)) else {
        return Items::new();
    };
    shape(
        Shape::path(Purpose::Swipe, path.to_vec())
            .unfilled()
            .stroked(Stroke {
                cap: Some(Cap::Butt),
                ..Stroke::new(ink, width + SWIPE_EXTRA)
                    .rounded()
                    .at(SWIPE_OPACITY)
                    .dashed(outline_dash(standing))
            }),
    )
}

const BADGE_SIDE: f64 = 5.4;
const BADGE_ABOVE: f64 = 5.2;
const BADGE_BELOW: f64 = 4.4;

/// The warning's triangle.
fn badge_glyph() -> Vec<PathStep> {
    vec![
        PathStep::Move {
            to: at(0.0, -BADGE_ABOVE),
        },
        PathStep::Line {
            to: at(BADGE_SIDE, BADGE_BELOW),
        },
        PathStep::Across { x: -BADGE_SIDE },
        PathStep::Close,
    ]
}

/// The warning's bar and dot.
fn badge_bang_and_dot() -> Vec<PathStep> {
    vec![
        PathStep::Move { to: at(0.0, -2.4) },
        PathStep::Down { y: 0.9 },
        PathStep::Move { to: at(0.0, 2.6) },
        PathStep::Down { y: 2.9 },
    ]
}

/// The warning's marks, centred on the origin.
pub(super) fn warning_glyph(palette: &Palette) -> Items {
    concat(vec![
        shape(Shape::path(Purpose::Line, badge_glyph()).filled(&palette.warning)),
        shape(
            Shape::path(Purpose::Line, badge_bang_and_dot())
                .unfilled()
                .stroked(Stroke::new(&palette.background, PIN_STROKE).capped(Cap::Round)),
        ),
    ])
}

/// The warning mark, centred where it was put.
fn warning_mark(x: f64, y: f64, palette: &Palette) -> Items {
    grouped(placed_mark(Role::Warning, x, y, warning_glyph(palette)).pointer(Pointer::None))
}

/// The warning on a box's top-right corner.
pub(super) fn warning_badge(rect: Rect, unsettled: bool, palette: &Palette) -> Items {
    if !unsettled {
        return Items::new();
    }
    warning_mark(rect.x + rect.width - PIN_INSET, rect.y + PIN_INSET, palette)
}

/// What a subject's box and the marks on its corners cover, which the page must hold.
pub(super) fn marked_box(rect: Rect, standing: Option<Standing>, unsettled: bool) -> Rect {
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
pub(super) fn warning_on_line(at: Option<Point>, unsettled: bool, palette: &Palette) -> Items {
    match at {
        Some(at) if unsettled => warning_mark(at.x, at.y, palette),
        _ => Items::new(),
    }
}
