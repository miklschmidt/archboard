//! A move from one scene to another, as a pure function (ADR 0071).
//!
//! A transition is a function from scene A, scene B and a progress value to an
//! in-between scene. It pairs groups by subject id and carries typed geometry,
//! opacity and transforms from one to the other. Nothing here draws, reads a
//! clock or keeps state between frames, so a test of it needs no GPU and no
//! DOM, and the same inputs give the same bytes.
//!
//! The in-between is plain items. Progress is a share of the whole move, and
//! every phase of it comes from [`Phases`], which the host reads from
//! `@archboard/timing`. [`Between`] turns one scene into the next, [`entrance()`]
//! brings a scene in with nothing to carry it from, and [`departure()`] sends the
//! last scene off.

mod arrive;
mod card;
mod content;
mod departure;
mod ease;
mod entrance;
mod found;
mod line;
mod morph;
mod phases;
mod plan;
mod rename;
#[cfg(test)]
mod testing;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use archboard_scene::scene::{Definition, Item, Role, Scene, SubjectKind, Transform};

use arrive::{Ground, Grow, Leave, Swap};
use card::CardCarry;
use content::unpark;
use ease::{emphasised, phase};
use found::{Form, Found, found, holds_subject, pair};
use line::{DrawOn, LineCarry};
use plan::{Mover, Plan, Wiring};

pub use departure::{Heading, departure};
pub use entrance::{Entrance, entrance};
#[cfg(test)]
pub(crate) use phases::fixtures::PHASES;
pub use phases::{Entry, Phases, Transition};

/// One move from scene A to scene B, prepared once and sampled every frame.
///
/// Preparing pairs the groups and refines the routes. A frame then clones what
/// does not change and works out the rest.
#[derive(Clone, Debug)]
pub struct Between {
    plan: Plan,
    /// The next scene's body as it stands, parked marks and all.
    landed: Vec<Item>,
    definitions: Vec<Definition>,
    shift: (f64, f64),
    phases: Transition,
}

/// The mover of a subject in both scenes, and whether its line goes quiet in
/// flight.
fn carried(old: &Found<'_>, new: &Found<'_>, phases: Transition) -> Option<(Mover, bool)> {
    let ground = Ground::new(old.group, new.group, phases);
    let swap = || Some((Mover::Swap(Swap::new(old.group, new.group, phases)), false));
    let still = |carry: Option<Mover>| {
        carry
            .or_else(|| ground.map(|ground| Mover::Visible(new.group.clone(), ground)))
            .map(|mover| (mover, false))
    };
    if old.form() != new.form() {
        return swap();
    }
    match new.form() {
        Form::Line => match LineCarry::new(old, new, phases) {
            Some(line) => Some((Mover::Line(line, ground), true)),
            None => still(None),
        },
        Form::Card => match (old.frame, new.frame) {
            (Some(from), Some(to)) => still(
                CardCarry::new(old, from, new, to, phases)
                    .map(|card| Mover::Card(Box::new(card), ground)),
            ),
            _ => swap(),
        },
    }
}

/// The mover of a subject only the next scene has, and whether its line goes
/// quiet in flight.
fn arriving(new: &Found<'_>, phases: Transition) -> (Mover, bool) {
    if new.form() == Form::Line {
        let draw = DrawOn::new(new.group, phases.enter_start, 1.0, phases.arrowhead_at);
        return (Mover::Draw(draw), true);
    }
    // New labels arrive together, as the last layer, once their lines are in.
    let start = if new.is_label() {
        phases.labels_start
    } else {
        phases.enter_start
    };
    (Mover::Grow(Grow::new(new, start, 1.0)), false)
}

/// Where in a body a subject only the last scene had goes, so that it is drawn
/// at the depth its kind is drawn at: a container behind everything, a
/// connection behind the cards, a card in front.
fn depth_of(body: &[Item], kind: SubjectKind) -> usize {
    let first = match kind {
        SubjectKind::Region => body.iter().position(|item| holds_subject(item, &|_| true)),
        SubjectKind::Edge => body
            .iter()
            .position(|item| holds_subject(item, &|kind| kind == SubjectKind::Node)),
        _ => None,
    };
    first.unwrap_or(body.len())
}

/// Every definition among some items, to any depth.
fn defined_in(items: &[Item], found: &mut Vec<Definition>) {
    for item in items {
        match item {
            Item::Definitions { definitions } => found.extend(definitions.iter().cloned()),
            Item::Group(group) => defined_in(&group.items, found),
            Item::Viewport(viewport) => defined_in(&viewport.items, found),
            _ => {}
        }
    }
}

/// Every definition of the next scene, wherever it stands, and the last scene's
/// beside them: its masks and clips are renamed already, and its arrowheads and
/// gradients are named by what they are, so the next scene's own stand for the
/// same ones.
fn borrowed_definitions(last: &Scene, next: &Scene) -> Vec<Definition> {
    let mut known = next.definitions.clone();
    defined_in(&next.body, &mut known);
    let mut kept = known.clone();
    let mut theirs = last.definitions.clone();
    defined_in(&last.body, &mut theirs);
    for definition in theirs {
        let own = match &definition {
            Definition::Marker(marker) => known
                .iter()
                .any(|d| matches!(d, Definition::Marker(m) if m.id == marker.id)),
            Definition::Gradient(gradient) => known
                .iter()
                .any(|d| matches!(d, Definition::Gradient(g) if g.id == gradient.id)),
            Definition::Mask(_) | Definition::Clip(_) => false,
        };
        if !own {
            kept.push(definition);
        }
    }
    kept
}

impl Between {
    /// Prepare the move from `from` to `to`.
    ///
    /// `shift` is how far the camera moved to keep the shared cards still, as
    /// the page worked it out. The picture starts that far back and eases home
    /// with the cards, so at 0 it is `from` drawn translated by the negative of
    /// `shift`.
    pub fn new(from: &Scene, to: &Scene, shift: (f64, f64), phases: &Phases) -> Between {
        let phases = phases.transition;
        let mut last = from.clone();
        rename::scene(&mut last);
        unpark(&mut last.body);
        let mut next = to.clone();
        unpark(&mut next.body);
        let (old, new) = (found(&last), found(&next));
        let pairing = pair(&old, &new);
        let mut movers = Vec::new();
        let mut of_subject = vec![None; new.len()];
        let mut silent = HashSet::new();
        let carries = pairing
            .shared
            .iter()
            .map(|&(a, b)| (b, carried(&old[a], &new[b], phases)));
        let arrivals = pairing
            .added
            .iter()
            .map(|&b| (b, Some(arriving(&new[b], phases))));
        for (b, mover) in carries.chain(arrivals) {
            if let Some((mover, quiet)) = mover {
                of_subject[b] = Some(movers.len());
                movers.push(mover);
                if quiet {
                    silent.insert(new[b].id);
                }
            }
        }
        let wiring = Wiring {
            of_subject: &of_subject,
            of_top: &HashMap::new(),
            silent: &silent,
        };
        let mut plan = Plan::new(&next.body, movers, &wiring);
        let mut leavers: Vec<(usize, Mover)> = pairing
            .removed
            .iter()
            .map(|&a| {
                (
                    depth_of(&next.body, old[a].subject.kind),
                    Mover::Leave(Leave::new(&old[a], phases)),
                )
            })
            .collect();
        leavers.sort_by_key(|&(place, _)| place);
        for (inserted, (place, mover)) in leavers.into_iter().enumerate() {
            plan.insert(place + inserted, mover);
        }
        Between {
            plan,
            landed: to.body.clone(),
            definitions: borrowed_definitions(&last, to),
            shift,
            phases,
        }
    }

    /// The in-between at a progress from 0 to 1, as a scene body.
    ///
    /// At 1 it is the next scene's body. Whatever the move parks, the shadows
    /// under the lines and the marks where routes join, a line's mask, its ports
    /// and its pulses, comes back on landing.
    pub fn at(&self, progress: f64) -> Vec<Item> {
        if progress >= 1.0 {
            return self.landed.clone();
        }
        let progress = progress.max(0.0);
        let body = self.plan.at(progress);
        // The camera already moved by the shift. The picture starts that far
        // back and eases home with the cards, so the shared cards stay still.
        let moved = emphasised(phase(
            progress,
            self.phases.move_start,
            self.phases.move_end,
        ));
        let left = 1.0 - moved;
        if (self.shift.0 == 0.0 && self.shift.1 == 0.0) || left <= 0.0 {
            return body;
        }
        let mut back = archboard_scene::scene::Group::new(Role::Move, body);
        back.transform = Some(Transform::translate(
            -self.shift.0 * left,
            -self.shift.1 * left,
        ));
        vec![Item::Group(back)]
    }

    /// The definitions the in-between refers to: the next scene's, and the last
    /// scene's under names that cannot collide with them.
    pub fn definitions(&self) -> Vec<Definition> {
        self.definitions.clone()
    }
}
