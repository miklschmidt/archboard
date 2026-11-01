//! What a card is made of, sorted for a move: its frame, which is carried
//! with the box, and its content, which is paired element by element between
//! the two scenes.
//!
//! An element is the same element when it is the same apart from where it is
//! drawn. A title that did not change is kept and glides with the card. A
//! description that did is one element leaving and one arriving, and the
//! title beside it is not disturbed.

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Geometry, Group, Item, Role, Shape, Transform};

/// Whether a group of a card is one a move parks until it lands.
pub(super) fn is_parked(group: &Group) -> bool {
    matches!(group.role, Role::Shadow(_) | Role::Junctions)
}

/// Take out of some items, to any depth, what a move parks until it lands:
/// the shadows cards and labels cast under the lines, and the marks where
/// routes join. Where routes join and where a card or a label stands depend on
/// where they land, so a mark stands at its new place while the lines, the
/// cards and the labels are still on their way.
pub(super) fn unpark(items: &mut Vec<Item>) {
    items.retain(|item| !matches!(item, Item::Group(group) if is_parked(group)));
    for item in items {
        match item {
            Item::Group(group) => unpark(&mut group.items),
            Item::Viewport(viewport) => unpark(&mut viewport.items),
            _ => {}
        }
    }
}

/// A group with none of its items: what it is, and not what it holds.
pub(super) fn shell(group: &Group) -> Group {
    Group {
        role: group.role.clone(),
        subject: group.subject.clone(),
        transform: group.transform,
        opacity: group.opacity,
        mask: group.mask.clone(),
        pointer: group.pointer,
        members: group.members.clone(),
        title: group.title.clone(),
        items: Vec::new(),
    }
}

/// A card's direct items, sorted.
#[derive(Debug, Default)]
pub(super) struct Parts<'a> {
    /// The shapes that are the card's frame: its body and the halo around it, a rule across it.
    pub(super) frame: Vec<&'a Shape>,
    /// Everything drawn inside it.
    pub(super) content: Vec<&'a Item>,
    /// What draws nothing, such as definitions, and stays where it is.
    pub(super) fixed: Vec<&'a Item>,
}

/// Whether a shape is the frame of its group rather than something drawn in it:
/// a box as wide and as tall as most of the box the group sits in, or a line
/// that runs most of its length.
fn is_frame(shape: &Shape, frame: Rect) -> bool {
    match &shape.geometry {
        Geometry::Rect { rect, .. } => {
            rect.width >= frame.width / 2.0 && rect.height >= frame.height / 2.0
        }
        Geometry::Line { from, to } => {
            (to.x - from.x).abs() >= frame.width / 2.0
                || (to.y - from.y).abs() >= frame.height / 2.0
        }
        Geometry::Circle { .. } | Geometry::Path { .. } => false,
    }
}

/// Sort a card's direct items.
pub(super) fn split(group: &Group, frame: Rect) -> Parts<'_> {
    let mut parts = Parts::default();
    for item in &group.items {
        match item {
            Item::Shape(shape) if is_frame(shape, frame) => parts.frame.push(shape),
            Item::Definitions { .. } | Item::Break => parts.fixed.push(item),
            Item::Group(group) if is_parked(group) => {}
            _ => parts.content.push(item),
        }
    }
    parts
}

/// A point at the origin: where nothing is drawn.
const ORIGIN: Point = Point { x: 0.0, y: 0.0 };

/// A shape's geometry with where it is taken out.
fn unplaced_geometry(geometry: &Geometry) -> Geometry {
    match geometry {
        Geometry::Rect { rect, radius } => Geometry::Rect {
            rect: Rect {
                x: 0.0,
                y: 0.0,
                ..*rect
            },
            radius: *radius,
        },
        Geometry::Circle { radius, .. } => Geometry::Circle {
            centre: None,
            radius: *radius,
        },
        Geometry::Line { .. } => Geometry::Line {
            from: ORIGIN,
            to: ORIGIN,
        },
        Geometry::Path { .. } => Geometry::Path { steps: Vec::new() },
    }
}

/// A shape with where it is drawn taken out: how it looks.
pub(super) fn look(shape: &Shape) -> Shape {
    Shape {
        geometry: unplaced_geometry(&shape.geometry),
        ..shape.clone()
    }
}

/// A move with where it goes taken out.
const STILL: Transform = Transform::translate(0.0, 0.0);

/// The role of a group with the places it names taken out.
fn unplaced_role(role: &Role) -> Role {
    match role {
        Role::Chip { .. } => Role::Chip { far: STILL },
        Role::Words { .. } => Role::Words { away: STILL },
        other => other.clone(),
    }
}

/// An item with where it is drawn taken out: what it is.
fn signature(item: &Item) -> Item {
    match item {
        Item::Group(group) => Item::Group(Group {
            role: unplaced_role(&group.role),
            transform: None,
            items: group.items.iter().map(signature).collect(),
            ..group.clone()
        }),
        Item::Shape(shape) => Item::Shape(look(shape)),
        Item::Text(text) => Item::Text(archboard_scene::scene::Text {
            at: ORIGIN,
            ..text.clone()
        }),
        Item::Viewport(viewport) => Item::Viewport(archboard_scene::scene::Viewport {
            frame: Rect {
                x: 0.0,
                y: 0.0,
                ..viewport.frame
            },
            view: Rect {
                x: 0.0,
                y: 0.0,
                ..viewport.view
            },
            items: viewport.items.iter().map(signature).collect(),
        }),
        other => other.clone(),
    }
}

/// A card's content, sorted by what the two scenes make of each element.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Paired {
    /// Elements of the new content the old content also drew, as indices into it.
    pub(super) kept: Vec<usize>,
    /// Elements only the new content draws.
    pub(super) arriving: Vec<usize>,
    /// Elements only the old content drew, as indices into it.
    pub(super) leaving: Vec<usize>,
}

/// Pair a card's content element by element between two scenes.
pub(super) fn pair_content(old: &[&Item], new: &[&Item]) -> Paired {
    let old: Vec<Item> = old.iter().map(|item| signature(item)).collect();
    let mut unmatched: Vec<Option<&Item>> = old.iter().map(Some).collect();
    let mut paired = Paired::default();
    for (index, item) in new.iter().enumerate() {
        let own = signature(item);
        let found = unmatched
            .iter_mut()
            .position(|left| left.is_some_and(|left| *left == own));
        match found {
            Some(at) => {
                unmatched[at] = None;
                paired.kept.push(index);
            }
            None => paired.arriving.push(index),
        }
    }
    paired.leaving = (0..old.len())
        .filter(|&at| unmatched[at].is_some())
        .collect();
    paired
}

#[cfg(test)]
mod tests {
    use super::pair_content;
    use crate::between::testing::words;

    #[test]
    fn a_title_that_only_moved_is_kept_and_a_new_description_arrives() {
        let old = [words(1.0, "Title"), words(1.0, "Old note")];
        let new = [words(9.0, "Title"), words(9.0, "New note")];
        let paired = pair_content(&[&old[0], &old[1]], &[&new[0], &new[1]]);
        assert_eq!(paired.kept, [0]);
        assert_eq!(paired.arriving, [1]);
        assert_eq!(paired.leaving, [1]);
    }
}
