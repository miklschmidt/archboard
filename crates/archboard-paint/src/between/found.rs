//! Which parts of two pictures are the same subject.
//!
//! A subject's id is minted once and never rewritten, so the id says that a
//! card in one scene and a card in the next are one node. A subject can be
//! drawn as more than one group (a container is its frame and its header, a
//! connection is its line and its label), always in the same order, so the
//! second group of an id in one scene is the second group of it in the other.

use std::collections::HashMap;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Geometry, Group, Item, Role, Scene, Subject, SubjectKind, Transform};

use super::ease::then;

/// What sort of thing a subject's group draws, as far as motion is concerned.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Form {
    /// A frame with content in it: a card, a container's frame or header, a label.
    Card,
    /// A drawn line: a connection's route.
    Line,
}

/// One group of one subject, in one scene.
#[derive(Clone, Copy, Debug)]
pub(super) struct Found<'a> {
    /// The subject's id.
    pub(super) id: &'a str,
    /// Which of the subject's groups this is, in drawing order.
    pub(super) ordinal: usize,
    /// The group.
    pub(super) group: &'a Group,
    /// Its subject.
    pub(super) subject: &'a Subject,
    /// The box the group is drawn in, when the scene says.
    pub(super) frame: Option<Rect>,
    /// How the plain groups it stands in move it, outermost first.
    pub(super) outer: Option<Transform>,
}

impl Found<'_> {
    /// Whether the group is a line.
    pub(super) fn form(&self) -> Form {
        if matches!(self.group.role, Role::Line(_)) {
            Form::Line
        } else {
            Form::Card
        }
    }

    /// Whether the group is the words of a connection.
    pub(super) fn is_label(&self) -> bool {
        matches!(self.group.role, Role::Label)
    }

    /// Whether the group is a container's frame or header.
    pub(super) fn is_region(&self) -> bool {
        self.subject.kind == SubjectKind::Region
    }
}

/// The largest box a group draws directly, which for a card is its body and
/// for a label its plate. The first of equal ones wins.
pub(super) fn largest_rect(group: &Group) -> Option<Rect> {
    let mut largest: Option<Rect> = None;
    for item in &group.items {
        if let Item::Shape(shape) = item
            && let Geometry::Rect { rect, .. } = &shape.geometry
            && largest.is_none_or(|known| rect.width * rect.height > known.width * known.height)
        {
            largest = Some(*rect);
        }
    }
    largest
}

/// Where the atlas says each subject is, by id.
fn atlas_boxes(scene: &Scene) -> HashMap<&str, Rect> {
    let atlas = &scene.atlas;
    // A later box of an id replaces an earlier one, so nodes go last and win.
    [&atlas.regions, &atlas.edges, &atlas.nodes]
        .into_iter()
        .flat_map(|boxes| boxes.0.iter())
        .map(|(id, own)| {
            let rect = Rect {
                x: own.x,
                y: own.y,
                width: own.width,
                height: own.height,
            };
            (id.as_str(), rect)
        })
        .collect()
}

/// Every subject group a scene draws, outermost only, in drawing order.
///
/// Outermost, because a group inside a subject's group is part of how that
/// subject is drawn and moves with it.
pub(super) fn found(scene: &Scene) -> Vec<Found<'_>> {
    let atlas = atlas_boxes(scene);
    let mut seen: HashMap<&str, usize> = HashMap::new();
    let mut groups = Vec::new();
    walk(&scene.body, None, &atlas, &mut seen, &mut groups);
    groups
}

/// Find the subject groups among some items.
fn walk<'a>(
    items: &'a [Item],
    outer: Option<Transform>,
    atlas: &HashMap<&str, Rect>,
    seen: &mut HashMap<&'a str, usize>,
    groups: &mut Vec<Found<'a>>,
) {
    for item in items {
        let Item::Group(group) = item else { continue };
        let Some(subject) = &group.subject else {
            let around = match (outer, group.transform) {
                (Some(outer), own) => Some(then(outer, own)),
                (None, own) => own,
            };
            walk(&group.items, around, atlas, seen, groups);
            continue;
        };
        let id = subject.id.as_str();
        let ordinal = seen.entry(id).or_insert(0);
        groups.push(Found {
            id,
            ordinal: *ordinal,
            group,
            subject,
            frame: largest_rect(group).or_else(|| atlas.get(id).copied()),
            outer,
        });
        *ordinal += 1;
    }
}

/// Whether an item is, or holds in plain groups, a subject of a wanted kind.
pub(super) fn holds_subject(item: &Item, wanted: &dyn Fn(SubjectKind) -> bool) -> bool {
    match item {
        Item::Group(group) => match &group.subject {
            Some(subject) => wanted(subject.kind),
            None => group
                .items
                .iter()
                .any(|inside| holds_subject(inside, wanted)),
        },
        _ => false,
    }
}

/// A group in both scenes, an old one with no new, or a new one with no old.
/// Each is an index into the groups of its scene.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct Pairing {
    /// Old and new, in the new scene's order.
    pub(super) shared: Vec<(usize, usize)>,
    /// Only the last scene had them, in its order.
    pub(super) removed: Vec<usize>,
    /// Only the next scene has them, in its order.
    pub(super) added: Vec<usize>,
}

/// Match the groups of one scene to the groups of the next.
pub(super) fn pair(before: &[Found<'_>], after: &[Found<'_>]) -> Pairing {
    let old: HashMap<(&str, usize), usize> = before
        .iter()
        .enumerate()
        .map(|(index, group)| ((group.id, group.ordinal), index))
        .collect();
    let mut kept = vec![false; before.len()];
    let mut pairing = Pairing::default();
    for (index, group) in after.iter().enumerate() {
        match old.get(&(group.id, group.ordinal)) {
            Some(&previous) => {
                kept[previous] = true;
                pairing.shared.push((previous, index));
            }
            None => pairing.added.push(index),
        }
    }
    pairing.removed = (0..before.len()).filter(|&index| !kept[index]).collect();
    pairing
}
