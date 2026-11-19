//! A move from one scene to another, as a pure function (ADR 0071).
//!
//! A transition is a function from scene A, scene B and a progress value to an
//! in-between scene. It pairs groups by subject id and carries typed geometry,
//! opacity and transforms from one to the other. Nothing here draws, reads a
//! clock or keeps state between frames, so a test of it needs no GPU and no
//! DOM, and the same inputs give the same bytes.
//!
//! The in-between is plain items. Progress is a share of the move, past 1 while
//! the last sparks run on, and every phase of it comes from [`Phases`], which the
//! host reads from `@archboard/timing`. A [`Between`] carries one scene into the
//! next, or brings a scene in with nothing to carry it from, and
//! [`departing()`] sends the last scene off.

mod arrive;
mod card;
mod carry;
mod circuit;
mod content;
#[cfg(test)]
mod continuity;
mod definitions;
mod departure;
mod ease;
mod entrance;
#[cfg(test)]
mod entrance_order;
mod found;
mod handover;
#[cfg(test)]
mod interrupted;
mod line;
mod morph;
mod open;
mod phases;
mod plan;
mod rename;
mod resize;
mod ride;
#[cfg(test)]
mod settling;
mod spark;
#[cfg(test)]
mod testing;
#[cfg(test)]
mod tests;
mod unfold;

use std::collections::HashSet;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Definition, Group, Item, Mask, Role, Scene, Transform};

use content::shell;
use definitions::clear_definitions;
use ease::emphasised;
use found::found;
use plan::Plan;
use unfold::Unfold;

use crate::timing::phase;

pub(crate) use departure::departing;
pub(crate) use handover::Handover;
pub(crate) use phases::Phases;
#[cfg(test)]
pub(crate) use phases::fixtures::PHASES;

/// Some items without what belongs to some subjects: their groups, and the
/// shadows they cast.
fn without(items: &[Item], subjects: &HashSet<String>) -> Vec<Item> {
    let gone = |group: &Group| {
        group
            .subject
            .as_ref()
            .is_some_and(|subject| subjects.contains(&subject.id))
            || (matches!(group.role, Role::Shadow(_))
                && group
                    .members
                    .first()
                    .is_some_and(|owner| subjects.contains(owner)))
    };
    items
        .iter()
        .filter_map(|item| match item {
            Item::Group(group) if gone(group) => None,
            Item::Group(group) if group.subject.is_none() => Some(Item::Group(Group {
                items: without(&group.items, subjects),
                ..shell(group)
            })),
            other => Some(other.clone()),
        })
        .collect()
}

/// The box a subject's first group is drawn in, when the scene says.
pub(crate) fn frame_of(scene: &Scene, subject: &str) -> Option<Rect> {
    found(scene)
        .iter()
        .find(|group| group.id == subject)
        .and_then(|group| group.frame)
}

/// One move into a scene, prepared once and sampled every frame by its
/// progress: the last picture carried into the next, or a picture coming in
/// part by part.
///
/// Preparing pairs the groups and refines the routes. A frame then clones what
/// does not change and works out the rest.
#[derive(Debug)]
pub(crate) struct Between {
    plan: Plan,
    /// The next scene's body as it stands, parked marks and all.
    landed: Vec<Item>,
    /// Where the move ends, as a share of its time: past 1, while a spark runs.
    length: f64,
    kind: Kind,
}

/// What one kind of move holds that the other has no use for.
#[derive(Debug)]
enum Kind {
    /// The last picture carried into the next.
    Carry {
        /// The definitions the in-between refers to: the next scene's, and the
        /// last scene's under names that cannot collide with them.
        definitions: Vec<Definition>,
        shift: (f64, f64),
        /// The part of the move the picture eases home over.
        homing: (f64, f64),
        /// The largest door that opens in the move.
        opening: Option<Unfold>,
    },
    /// A picture coming in part by part.
    Entrance {
        /// Whether a container of the last picture stays on as a tray of this one.
        keeps_tray: bool,
    },
}

/// What a move is about, for the lens it is seen through, and how far through
/// the move it is, up to 1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Focus {
    /// A picture coming in part by part.
    Entrance(f64),
    /// The door that opens in a carry, in the picture's units.
    Door(Rect, f64),
}

impl Between {
    /// Prepare the carry from `from` to `to`.
    ///
    /// `shift` is how far the camera moved to keep the shared cards still, as
    /// the page worked it out. The picture starts that far back and eases home
    /// with the cards, so at 0 it is `from` drawn translated by the negative of
    /// `shift`.
    pub(crate) fn carry(from: &Scene, to: &Scene, shift: (f64, f64), phases: &Phases) -> Between {
        let phases = phases.transition;
        let carried = carry::planned(from, to, phases);
        Between {
            plan: carried.plan,
            landed: to.body.clone(),
            length: carried.length,
            kind: Kind::Carry {
                definitions: carried.definitions,
                shift,
                homing: (phases.move_start, phases.move_end),
                opening: carried.opening,
            },
        }
    }

    /// Prepare the entrance of a scene, taking over from a last picture if there
    /// is one. With a last picture whose subjects fly over, it also answers what
    /// is left of that picture's body once they have gone.
    pub(crate) fn enter(
        to: &Scene,
        phases: &Phases,
        handover: Option<Handover<'_>>,
    ) -> (Between, Option<Vec<Item>>) {
        let entered = entrance::planned(to, phases, handover);
        let left = handover
            .filter(|_| !entered.flown.is_empty())
            .map(|handover| without(&handover.last.body, &entered.flown));
        let between = Between {
            plan: entered.plan,
            landed: to.body.clone(),
            length: entered.length,
            kind: Kind::Entrance {
                keeps_tray: entered.keeps_tray,
            },
        };
        (between, left)
    }

    /// Where the move ends, as a share of its time.
    pub(crate) fn length(&self) -> f64 {
        self.length
    }

    /// The in-between at a progress from 0 to its length, as a scene body, and
    /// the masks of the lines that move at that progress. Each mask stands in for
    /// what the definitions hold under its name; an entrance moves none.
    ///
    /// At its length the body is the next scene's. What the move parks, a line's
    /// ports, comes back on landing.
    pub(crate) fn at(&self, progress: f64) -> (Vec<Item>, Vec<Mask>) {
        let masks = match self.kind {
            Kind::Carry { .. } => self.plan.masks_at(progress),
            Kind::Entrance { .. } => Vec::new(),
        };
        if progress >= self.length {
            return (self.landed.clone(), masks);
        }
        let progress = progress.max(0.0);
        let body = self.plan.at(progress);
        // The camera already moved by the shift. The picture starts that far
        // back and eases home with the cards, so the shared cards stay still.
        let back = self.back_at(progress);
        if back == (0.0, 0.0) {
            return (body, masks);
        }
        let mut around = Group::new(Role::Move, body);
        around.transform = Some(Transform::translate(-back.0, -back.1));
        (vec![Item::Group(around)], masks)
    }

    /// How far back of its place the picture stands at a progress. An entrance
    /// stands in its place.
    fn back_at(&self, progress: f64) -> (f64, f64) {
        let Kind::Carry {
            shift,
            homing: (start, end),
            ..
        } = self.kind
        else {
            return (0.0, 0.0);
        };
        let left = 1.0 - emphasised(phase(progress, start, end));
        (shift.0 * left, shift.1 * left)
    }

    /// The definitions a carry's in-between refers to: the next scene's, and the
    /// last scene's under names that cannot collide with them. An entrance draws
    /// with the next scene's own.
    pub(crate) fn definitions(&self) -> Option<&[Definition]> {
        match &self.kind {
            Kind::Carry { definitions, .. } => Some(definitions),
            Kind::Entrance { .. } => None,
        }
    }

    /// The in-between at a progress as a scene, and how far back of its place it
    /// stands. A picture that arrives during a move starts from it, so that it
    /// takes over from what the reader sees. `landed` is the scene the move lands
    /// on.
    pub(crate) fn seen_at(&self, progress: f64, landed: &Scene) -> (Scene, (f64, f64)) {
        let Kind::Carry { definitions, .. } = &self.kind else {
            let scene = Scene {
                body: self.at(progress).0,
                ..landed.clone()
            };
            return (scene, (0.0, 0.0));
        };
        if progress >= self.length {
            return (landed.clone(), (0.0, 0.0));
        }
        let masks = self.plan.masks_at(progress);
        let mut definitions = definitions.clone();
        definitions.retain(|definition| {
            !matches!(definition, Definition::Mask(mask) if masks.iter().any(|moved| moved.id == mask.id))
        });
        definitions.extend(masks.into_iter().map(Definition::Mask));
        let mut body = self.plan.at(progress.max(0.0));
        clear_definitions(&mut body);
        let scene = Scene {
            definitions,
            body,
            ..landed.clone()
        };
        (scene, self.back_at(progress))
    }

    /// What the move is about at a progress: the door that opens in a carry, or
    /// an entrance. An entrance that keeps a container of the last picture as its
    /// tray is about that tray, which stays in focus, so it answers none.
    pub(crate) fn focus(&self, progress: f64) -> Option<Focus> {
        let progress = progress.min(1.0);
        match self.kind {
            Kind::Carry { opening, .. } => {
                opening.map(|unfold| Focus::Door(unfold.box_at(progress), progress))
            }
            Kind::Entrance { keeps_tray } => (!keeps_tray).then_some(Focus::Entrance(progress)),
        }
    }

    /// The box of the tray the last picture leaves inside, when it has one. Only
    /// an entrance holds the last picture in a tray.
    pub(crate) fn holder_at(&self, progress: f64) -> Option<Rect> {
        self.plan.holder_at(progress)
    }

    /// Say how the last picture's units map onto this picture's: the two can stand
    /// under different cameras. A carry's last picture is the one it carries, so a
    /// carry is never rebased.
    pub(crate) fn rebase(&mut self, carry: Transform) {
        if let Kind::Entrance { .. } = self.kind {
            self.plan.rebase(carry);
        }
    }
}
