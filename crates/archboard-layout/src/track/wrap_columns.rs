//! Straight lines through a wrap (visual polish). A wrap deals a rank's cards
//! into rows and holds each lowered card under the card dealt above it, which
//! says nothing of the card's own lines. Once Graphviz has placed the wrap, a
//! lowered card whose one line comes from a block's port moves along its row
//! as near under the port as it may, and a lowered card standing between a
//! line's ends, where no column lets the line drop straight past it, steps
//! aside by the least that opens one, at most a few lanes.

use crate::ecma::{abs, js_max, js_min, sorted_by};
use crate::geometry::Rect;
use crate::track::chains::{FACE_MARGIN, LANE};
use crate::track::graphviz::{Columns, Join, Wrap};
use crate::track::scene::{Map, Set};
use crate::track::score::sinks;

/// The furthest a card standing in a line's way steps aside: four lanes.
const STEP_ASIDE: f64 = 4.0 * LANE;
/// How finely a card moving under a port searches its row.
const SEARCH_STEP: f64 = 2.0;

/// Whether a line passes over an item rather than around it: containers and their parts.
fn hollow(name: &str) -> bool {
    ["cluster:", "title:", "pin:", "port:", "stub:", "header:"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

/// Where a line may meet an item straight.
fn reach(columns: &Columns<'_, '_>, name: &str) -> (f64, f64) {
    let at = columns.boxes[name];
    let margin = js_min(
        if name.starts_with("label:") {
            LANE
        } else {
            FACE_MARGIN
        },
        at.width / 2.0,
    );
    (at.x + margin, at.x + at.width - margin)
}

/// Where both ends of a line may meet it straight, if anywhere.
fn common(columns: &Columns<'_, '_>, join: &Join) -> Option<(f64, f64)> {
    let ((a, b), (c, d)) = (reach(columns, &join.tail), reach(columns, &join.head));
    let (low, high) = (js_max(a, c), js_min(b, d));
    (low <= high).then_some((low, high))
}

/// The items standing wholly between a line's two ends that it must pass around.
fn standing(columns: &Columns<'_, '_>, join: &Join) -> Vec<(String, Rect)> {
    let (top, low) = (columns.boxes[&join.tail], columns.boxes[&join.head]);
    let own: Set<&str> = [join.tail.as_str(), join.head.as_str()]
        .into_iter()
        .chain(join.label.as_deref())
        .collect();
    columns
        .boxes
        .iter()
        .filter(|(name, at)| {
            !own.contains(name.as_str())
                && !hollow(name)
                && at.y >= top.y + top.height - 0.5
                && at.y + at.height <= low.y + 0.5
        })
        .map(|(name, at)| (name.clone(), *at))
        .collect()
}

/// The stretch of x a box keeps a passing lane off.
fn kept(at: &Rect) -> (f64, f64) {
    (at.x - LANE, at.x + at.width + LANE)
}

/// What stays of a span once some stretches are taken out of it, left to right.
fn open_parts(span: (f64, f64), taken: &[(f64, f64)]) -> Vec<(f64, f64)> {
    let mut parts = Vec::new();
    let mut low = span.0;
    for (start, end) in sorted_by(taken, |one, other| one.0 - other.0) {
        if end <= low || start >= span.1 {
            continue;
        }
        if start >= low {
            parts.push((low, start));
        }
        low = end;
    }
    if low <= span.1 {
        parts.push((low, span.1));
    }
    parts
}

/// Whether a line may drop straight.
fn straight(columns: &Columns<'_, '_>, join: &Join) -> bool {
    let span = common(columns, join);
    let taken: Vec<(f64, f64)> = standing(columns, join)
        .iter()
        .map(|(_, at)| kept(at))
        .collect();
    span.is_some_and(|span| !open_parts(span, &taken).is_empty())
}

/// How many lines an item is an end of.
fn lines_of(columns: &Columns<'_, '_>, name: &str) -> usize {
    columns
        .joins
        .iter()
        .filter(|join| join.tail == name || join.head == name)
        .count()
}

/// Whether a card was lowered by the wrap.
fn lowered(wrap: &Wrap<'_>, name: &str) -> bool {
    wrap.rows.get(name).copied().unwrap_or(0) > 0
}

/// Whether the wrap, as the items now stand, sinks a card off the rows above it.
fn sunk(columns: &Columns<'_, '_>, wrap: &Wrap<'_>) -> bool {
    let plan: Map<String, usize> = wrap
        .rows
        .iter()
        .filter(|(card, _)| columns.boxes.contains_key(card.as_str()))
        .map(|(card, &row)| (card.clone(), row))
        .collect();
    sinks(&plan, columns.boxes, wrap.around)
}

/// The lowered card at one end of a line whose other end is a block's port,
/// when the line is the card's only one.
fn under_port(columns: &Columns<'_, '_>, wrap: &Wrap<'_>, join: &Join) -> Option<(String, String)> {
    [
        (join.head.clone(), join.tail.clone()),
        (join.tail.clone(), join.head.clone()),
    ]
    .into_iter()
    .find(|(card, port)| {
        port.starts_with("pin:")
            && lowered(wrap, card)
            && columns.room.is_card(card)
            && lines_of(columns, card) == 1
    })
}

/// The offsets from a port's x a card's centre may take and still reach it with its face, nearest first.
fn offsets_under(width: f64) -> Vec<f64> {
    let most = ((width / 2.0 - FACE_MARGIN) / SEARCH_STEP).floor();
    if most < 0.0 {
        return Vec::new();
    }
    (0..2 * most as usize + 1)
        .map(|index| {
            if index % 2 == 0 {
                (index / 2) as f64 * SEARCH_STEP
            } else {
                -(index.div_ceil(2) as f64) * SEARCH_STEP
            }
        })
        .collect()
}

/// Move a lowered card whose one line comes from a block's port along its
/// row, as near under the port as it may stand with its line straight.
fn move_under_port(columns: &mut Columns<'_, '_>, wrap: &Wrap<'_>, join: &Join) -> bool {
    let Some((card, port)) = under_port(columns, wrap, join) else {
        return false;
    };
    let was = columns.boxes[&card];
    let (x, _) = reach(columns, &port);
    let now = if straight(columns, join) {
        abs(was.x + was.width / 2.0 - x)
    } else {
        f64::INFINITY
    };
    for offset in offsets_under(was.width) {
        if abs(offset) >= now - 0.5 {
            continue;
        }
        let at = columns.moved(&card, x + offset);
        if !columns.free(&card, &at) {
            continue;
        }
        columns.boxes.insert(card.clone(), at);
        if straight(columns, join) && !sunk(columns, wrap) {
            return true;
        }
        columns.boxes.insert(card.clone(), was);
    }
    false
}

/// The shifts that would take a card out of a line's way, nearest first.
fn shifts_aside(columns: &Columns<'_, '_>, join: &Join, card: &str) -> Vec<f64> {
    let at = columns.boxes[card];
    let others: Vec<(f64, f64)> = standing(columns, join)
        .iter()
        .filter(|(name, _)| name != card)
        .map(|(_, bx)| kept(bx))
        .collect();
    let shifts: Vec<f64> = open_parts(common(columns, join).expect("a common reach"), &others)
        .into_iter()
        .flat_map(|(low, high)| {
            [
                js_max(low, high - LANE) - LANE - (at.x + at.width),
                js_min(high, low + LANE) + LANE - at.x,
            ]
        })
        .filter(|shift| abs(*shift) >= 0.5 && abs(*shift) <= STEP_ASIDE)
        .collect();
    sorted_by(&shifts, |one, other| abs(*one) - abs(*other))
}

/// Step one lowered card out of a line's way, by the least that opens a column.
fn step_aside(columns: &mut Columns<'_, '_>, join: &Join, card: &str) -> bool {
    let was = columns.boxes[card];
    for shift in shifts_aside(columns, join, card) {
        let at = Rect {
            x: was.x + shift,
            ..was
        };
        if !columns.roomy(card, &at) {
            continue;
        }
        columns.boxes.insert(card.to_owned(), at);
        if straight(columns, join) {
            return true;
        }
        columns.boxes.insert(card.to_owned(), was);
    }
    false
}

/// Whether a stretch a box keeps a lane off reaches into a span.
fn into(stretch: (f64, f64), span: (f64, f64)) -> bool {
    stretch.0 < span.1 && stretch.1 > span.0
}

/// Open a straight column for a line the wrap closed.
fn clear_line(columns: &mut Columns<'_, '_>, wrap: &Wrap<'_>, join: &Join) {
    if move_under_port(columns, wrap, join) || straight(columns, join) {
        return;
    }
    let Some(span) = common(columns, join) else {
        return;
    };
    let ways: Vec<String> = standing(columns, join)
        .into_iter()
        .filter(|(name, at)| {
            lowered(wrap, name) && columns.room.is_card(name) && into(kept(at), span)
        })
        .map(|(name, _)| name)
        .collect();
    for name in ways {
        if step_aside(columns, join, &name) {
            return;
        }
    }
}

/// Keep the lines through a wrap straight where a lowered card stood in their way.
pub(crate) fn clear_wrap(columns: &mut Columns<'_, '_>, wrap: Option<&Wrap<'_>>) {
    let Some(wrap) = wrap else {
        return;
    };
    if !wrap.rows.values().any(|&row| row > 0) {
        return;
    }
    for join in columns.stacked() {
        clear_line(columns, wrap, &join);
    }
}
