//! Stacked members of a container out of one column (visual polish). A
//! container's title holds a member below it with an invisible Graphviz
//! edge, and where the edge's chain of virtual nodes passes a member on its
//! way down, the member stands one slot in from the container's wall while
//! the held member below stands at the wall. Once Graphviz has placed the
//! block, such a member moves onto the wall where that crowds nothing and
//! crosses no line.

use crate::ecma::abs;
use crate::geometry::Rect;
use crate::track::graphviz::{Columns, Holds};

/// How near a card must stand to a wall, or to a slot in from it, to stand there.
const AT: f64 = 1.0;

/// Whether two boxes share some width while one stands wholly over the other.
fn stacked(one: &Rect, other: &Rect) -> bool {
    let across = one.x < other.x + other.width && other.x < one.x + one.width;
    let apart = one.y + one.height <= other.y || other.y + other.height <= one.y;
    across && apart
}

/// How far a card stands in from each inner wall of its container.
fn inset(columns: &Columns<'_, '_>, name: &str) -> Option<[f64; 2]> {
    let (left, right) = (columns.room.within)(name)?;
    let at = columns.boxes.get(name)?;
    Some([at.x - left, right - at.x - at.width])
}

/// How far in from each inner wall of their container the other members of
/// a card's container stand, of those it stands over or under.
fn kin_insets(columns: &Columns<'_, '_>, holds: &Holds<'_>, name: &str) -> Vec<[f64; 2]> {
    let around = (holds.around)(name);
    let at = columns.boxes[name];
    columns
        .boxes
        .iter()
        .filter(|(other, bx)| {
            other.as_str() != name
                && columns.room.is_card(other)
                && (holds.around)(other) == around
                && stacked(bx, &at)
        })
        .map(|(other, _)| inset(columns, other).expect("a member inside its container"))
        .collect()
}

/// How far a card that may move stands in from each inner wall of its container.
fn movable_inset(columns: &Columns<'_, '_>, holds: &Holds<'_>, name: &str) -> Option<[f64; 2]> {
    let movable = columns.room.is_card(name) && !columns.held.contains(name);
    if movable && (holds.around)(name).is_some() {
        inset(columns, name)
    } else {
        None
    }
}

/// Where a card a hold stood a slot in from its container's wall belongs: how
/// far it moves right, or nothing when it stays.
fn slot_shift(columns: &Columns<'_, '_>, holds: &Holds<'_>, name: &str) -> Option<f64> {
    let room = movable_inset(columns, holds, name)?;
    let walls = kin_insets(columns, holds, name);
    let side = [0, 1].into_iter().find(|&one| {
        abs(room[one] - holds.slot) <= AT && walls.iter().any(|wall| abs(wall[one]) <= AT)
    })?;
    Some(if side == 0 { -room[0] } else { room[1] })
}

/// Move every member a hold stood a slot in from its container's wall onto
/// the wall, where that crowds nothing and crosses no line.
pub fn close_slots(columns: &mut Columns<'_, '_>, holds: Option<&Holds<'_>>) {
    let Some(holds) = holds else {
        return;
    };
    for index in 0..columns.boxes.len() {
        let (name, at) = columns
            .boxes
            .get_index(index)
            .map(|(name, at)| (name.clone(), *at))
            .expect("a box");
        let shift = slot_shift(columns, holds, &name);
        let moved = Rect {
            x: at.x + shift.unwrap_or(0.0),
            ..at
        };
        if shift.is_some() && columns.free(&name, &moved) {
            columns.boxes.insert(name, moved);
        }
    }
}
