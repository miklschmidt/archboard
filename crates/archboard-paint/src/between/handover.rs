//! What an entrance takes over from the picture that was there.

use std::collections::HashMap;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Scene, Transform};

use super::ease::{carried, then};
use super::found::{Found, found};
use super::open::containers;
use super::resize::Tray;

/// How much bigger or smaller a card can be in the next picture and still fly.
const MOST_CHANGE: f64 = 2.5;

/// What an entrance takes over from the picture that was there.
#[derive(Clone, Copy, Debug)]
pub struct Handover<'a> {
    /// The last picture.
    pub last: &'a Scene,
    /// How much of it still shows, from 0 to 1.
    pub shown: f64,
}

/// Whether a box holds another.
fn encloses(outer: Rect, inner: Rect) -> bool {
    outer.x <= inner.x
        && outer.y <= inner.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
}

/// Where the cards and containers of the next picture stood in the last one, and
/// how much of the last one shows. Only a card that stayed about its size flies: a
/// door that became a tile has no shape to keep.
#[derive(Default)]
pub(super) struct Last<'a> {
    stood: HashMap<&'a str, (Rect, f64)>,
    pub(super) trays: HashMap<&'a str, Tray>,
    /// The tray that all of the last picture's cards stood inside, when one did.
    pub(super) holder: Option<&'a str>,
    pub(super) shown: f64,
}

impl<'a> Last<'a> {
    /// What an entrance can take over, of what stands in the next picture.
    pub(super) fn of(handover: Option<Handover<'a>>) -> Last<'a> {
        let Some(handover) = handover else {
            return Last::default();
        };
        let groups = found(handover.last);
        let boxes = containers(&groups);
        let stood: HashMap<&str, (Rect, f64)> = groups
            .iter()
            .filter(|group| group.is_card() && group.ordinal == 0)
            .filter_map(|group| {
                let frame = group.frame?;
                let outer = group.outer.unwrap_or(Transform::translate(0.0, 0.0));
                let frame = carried(frame, then(outer, group.group.transform));
                Some((group.id, (frame, group.group.opacity.unwrap_or(1.0))))
            })
            .collect();
        let holder = boxes.iter().find(|&&(_, tray, _)| {
            let holds = |&(card, _): &(Rect, f64)| encloses(tray, card);
            stood.values().all(holds)
        });
        Last {
            holder: holder.map(|&(id, ..)| id),
            trays: boxes
                .iter()
                .filter_map(|&(id, whole, _)| {
                    let frame = groups.iter().find(|group| group.id == id)?;
                    Some((id, Tray::of(frame, whole)))
                })
                .collect(),
            stood,
            shown: handover.shown,
        }
    }

    /// The box a card stood in, when it can fly from there.
    pub(super) fn stood_for(&self, card: &Found<'_>) -> Option<(Rect, Rect, f64)> {
        let ((old, shown), new) = (*self.stood.get(card.id)?, card.frame?);
        let ratio = old.width / new.width;
        (1.0 / MOST_CHANGE..=MOST_CHANGE)
            .contains(&ratio)
            .then_some((old, new, shown))
    }

    /// Whether a group is of a container the last picture drew too.
    pub(super) fn keeps(&self, group: &Found<'_>) -> bool {
        group.is_region() && self.trays.contains_key(group.id)
    }
}
