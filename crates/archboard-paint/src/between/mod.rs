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
//! `@archboard/timing`. [`Between`] turns one scene into the next, [`Entrance`]
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
mod ride;
#[cfg(test)]
mod testing;
#[cfg(test)]
mod tests;

use std::collections::HashMap;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{
    Definition, Group, Item, Mask, Role, Scene, SubjectKind, TrafficMark, Transform,
};

use arrive::{Ground, Grow, LABEL_GONE_BY, Leave, Swap};
use card::CardCarry;
use content::{is_parked, unpark, unpark_held};
use ease::{emphasised, phase};
use found::{Form, Found, found, holds_subject, pair};
use line::{DrawOn, LineCarry};
use plan::{Mover, Plan, Riding, Wiring};
use ride::{Ride, mark_of};

pub use departure::{Heading, departure};
pub use entrance::Entrance;
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

/// Whether a label moves further than it is tall.
fn crosses(from: Rect, to: Rect) -> bool {
    (from.x - to.x).hypot(from.y - to.y) > to.height
}

/// The mover of a subject in both scenes.
fn carried(
    old: &Found<'_>,
    new: &Found<'_>,
    masks: (Option<&Mask>, Option<&Mask>),
    phases: Transition,
) -> Option<Mover> {
    let ground = Ground::new(old.group, new.group, phases);
    let swap = || Some(Mover::Swap(Swap::new(old.group, new.group, phases)));
    let still = |carry: Option<Mover>| {
        carry.or_else(|| ground.map(|ground| Mover::Visible(new.group.clone(), ground)))
    };
    if old.form() != new.form() {
        return swap();
    }
    match new.form() {
        Form::Line => match LineCarry::new(old, new, masks, phases) {
            Some(line) => Some(Mover::Line(line, ground)),
            None => still(None),
        },
        Form::Card => match (old.frame, new.frame) {
            (Some(from), Some(to)) if new.is_label() && crosses(from, to) => {
                Some(Mover::Swap(Swap::across(old.group, new.group, phases)))
            }
            (Some(from), Some(to)) => still(
                CardCarry::new(old, from, new, to, phases)
                    .map(|card| Mover::Card(Box::new(card), ground)),
            ),
            _ => swap(),
        },
    }
}

/// The mover of a subject only the next scene has.
fn arriving(new: &Found<'_>, phases: Transition) -> Mover {
    if new.form() == Form::Line {
        let draw = DrawOn::new(new.group, phases.enter_start, 1.0, phases.arrowhead_at);
        return Mover::Draw(draw);
    }
    // New labels arrive together, as the last layer, once their lines are in.
    let start = if new.is_label() {
        phases.labels_start
    } else {
        phases.enter_start
    };
    Mover::Grow(Grow::new(new, start, 1.0))
}

/// What a move would park, among some items, to any depth: the shadows and the
/// marks where routes join.
fn parked_in(items: &[Item]) -> Vec<Group> {
    let mut found = Vec::new();
    for item in items {
        match item {
            Item::Group(group) if is_parked(group) => found.push(group.clone()),
            Item::Group(group) => found.extend(parked_in(&group.items)),
            Item::Viewport(viewport) => found.extend(parked_in(&viewport.items)),
            _ => {}
        }
    }
    found
}

/// Every line's pulses among some items, to any depth.
fn traffic_in<'a>(items: &'a [Item], found: &mut HashMap<&'a str, &'a TrafficMark>) {
    for item in items {
        match item {
            Item::Group(group) => match &group.role {
                Role::Traffic(line) => {
                    if let Some(mark) = mark_of(group) {
                        found.insert(line, mark);
                    }
                }
                _ => traffic_in(&group.items, found),
            },
            Item::Viewport(viewport) => traffic_in(&viewport.items, found),
            _ => {}
        }
    }
}

/// What a move knows about the last picture when it meets a shadow, a mark or
/// a line's pulses.
struct LastPicture<'a> {
    /// How far back each carried card starts.
    moved: HashMap<&'a str, (f64, f64)>,
    /// The pulses of each line.
    traffic: HashMap<&'a str, &'a TrafficMark>,
}

/// What moves a shadow, a line's pulses or the marks where routes join. A shadow
/// rides under the card that casts it, and one that nothing carries comes in
/// with what is new. Pulses run on, and those of a new line start once it is
/// drawn. The marks stand where the routes land, so they come in as the lines
/// arrive.
fn furniture_of(item: &Item, last: &LastPicture<'_>, phases: Transition) -> Option<Mover> {
    let Item::Group(group) = item else {
        return None;
    };
    let landing = (phases.labels_start, 1.0);
    match &group.role {
        Role::Junctions => Some(Mover::Frame(item.clone(), landing.0, landing.1)),
        Role::Shadow(_) => {
            let owner = group.members.first()?;
            match last.moved.get(owner.as_str()) {
                Some(&(0.0, 0.0)) => None,
                Some(&back) => Some(Mover::Riding(Box::new(Riding {
                    shadow: group.clone(),
                    back,
                    start: phases.move_start,
                    end: phases.move_end,
                }))),
                None => Some(Mover::Frame(item.clone(), landing.0, landing.1)),
            }
        }
        Role::Traffic(line) => {
            let next = mark_of(group)?;
            match last.traffic.get(line.as_str()) {
                Some(&mark) if mark == next => None,
                Some(&mark) => {
                    Ride::new(mark, group, phases).map(|ride| Mover::Ride(Box::new(ride)))
                }
                None => Some(Mover::Frame(item.clone(), phases.arrowhead_at, 1.0)),
            }
        }
        _ => None,
    }
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

/// Every mask of a scene, by the name of its line.
fn masks_of(scene: &Scene) -> HashMap<String, Mask> {
    let mut known = scene.definitions.clone();
    defined_in(&scene.body, &mut known);
    known
        .into_iter()
        .filter_map(|definition| match definition {
            Definition::Mask(mask) => Some((mask.id.line.clone(), mask)),
            _ => None,
        })
        .collect()
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
        let parked = parked_in(&last.body);
        unpark(&mut last.body);
        let mut next = to.clone();
        unpark_held(&mut next.body);
        let (old, new) = (found(&last), found(&next));
        let pairing = pair(&old, &new);
        let moved: HashMap<&str, (f64, f64)> = pairing
            .shared
            .iter()
            .filter(|&&(a, b)| old[a].form() == Form::Card && new[b].form() == Form::Card)
            .filter_map(|&(a, b)| {
                let (from, to) = (old[a].frame?, new[b].frame?);
                let rides = !(new[b].is_label() && crosses(from, to));
                rides.then_some((new[b].id, (from.x - to.x, from.y - to.y)))
            })
            .collect();
        let (last_masks, next_masks) = (masks_of(&last), masks_of(&next));
        let mask_of = |found: &Found<'_>, masks: &HashMap<String, Mask>| {
            let id = found.group.mask.as_ref()?;
            masks.get(&id.line).cloned()
        };
        let mut movers = Vec::new();
        let mut of_subject = vec![None; new.len()];
        let carries = pairing.shared.iter().map(|&(a, b)| {
            let masks = (mask_of(&old[a], &last_masks), mask_of(&new[b], &next_masks));
            (
                b,
                carried(
                    &old[a],
                    &new[b],
                    (masks.0.as_ref(), masks.1.as_ref()),
                    phases,
                ),
            )
        });
        let arrivals = pairing
            .added
            .iter()
            .map(|&b| (b, Some(arriving(&new[b], phases))));
        for (b, mover) in carries.chain(arrivals) {
            if let Some(mover) = mover {
                of_subject[b] = Some(movers.len());
                movers.push(mover);
            }
        }
        let mut traffic = HashMap::new();
        traffic_in(&last.body, &mut traffic);
        let mut landing = HashMap::new();
        traffic_in(&next.body, &mut landing);
        let stays = |owner: &str| moved.contains_key(owner);
        let lines_at = depth_of(&next.body, SubjectKind::Edge);
        let stopping: Vec<(usize, Mover)> = traffic
            .iter()
            .filter(|(line, _)| !landing.contains_key(*line))
            .map(|(_, mark)| {
                let pulses = Item::Traffic((*mark).clone());
                (
                    lines_at,
                    Mover::Leave(Leave::plain(pulses, phases.exit_end)),
                )
            })
            .chain(
                parked
                    .into_iter()
                    .filter(|group| group.members.first().is_none_or(|owner| !stays(owner)))
                    .map(|group| {
                        let item = Item::Group(group);
                        (0, Mover::Leave(Leave::plain(item, LABEL_GONE_BY)))
                    }),
            )
            .collect();
        let known = LastPicture { moved, traffic };
        let furniture = |item: &Item, _: bool| furniture_of(item, &known, phases);
        let wiring = Wiring {
            of_subject: &of_subject,
            furniture: &furniture,
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
            .chain(stopping)
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
    /// At 1 it is the next scene's body. What the move parks, a line's ports,
    /// comes back on landing.
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
        let mut back = Group::new(Role::Move, body);
        back.transform = Some(Transform::translate(
            -self.shift.0 * left,
            -self.shift.1 * left,
        ));
        vec![Item::Group(back)]
    }

    /// The masks of the lines that move, at a progress from 0 to 1. Each stands
    /// in for what the definitions hold under its name.
    pub fn masks_at(&self, progress: f64) -> Vec<Mask> {
        self.plan.masks_at(progress)
    }

    /// The definitions the in-between refers to: the next scene's, and the last
    /// scene's under names that cannot collide with them.
    pub fn definitions(&self) -> Vec<Definition> {
        self.definitions.clone()
    }
}
