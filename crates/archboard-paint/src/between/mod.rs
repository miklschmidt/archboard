//! A move from one scene to another, as a pure function (ADR 0071).
//!
//! A transition is a function from scene A, scene B and a progress value to an
//! in-between scene. It pairs groups by subject id and carries typed geometry,
//! opacity and transforms from one to the other. Nothing here draws, reads a
//! clock or keeps state between frames, so a test of it needs no GPU and no
//! DOM, and the same inputs give the same bytes.
//!
//! The in-between is plain items. Progress is a share of the move, past 1 while
//! the last sparks run on, and
//! every phase of it comes from [`Phases`], which the host reads from
//! `@archboard/timing`. [`Between`] turns one scene into the next, [`Entrance`]
//! brings a scene in with nothing to carry it from, and [`departure()`] sends the
//! last scene off.

mod arrive;
mod card;
mod circuit;
mod content;
mod definitions;
mod departure;
mod ease;
mod entrance;
mod found;
#[cfg(test)]
mod interrupted;
mod line;
mod morph;
mod phases;
mod plan;
mod rename;
mod ride;
#[cfg(test)]
mod settling;
mod spark;
#[cfg(test)]
mod testing;
#[cfg(test)]
mod tests;
mod unfold;

use std::collections::{HashMap, HashSet};

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Definition, Group, Item, Mask, Role, Scene, SubjectKind, Transform};

use arrive::{Ground, Grow, LABEL_GONE_BY, Leave, Swap};
use card::CardCarry;
use circuit::{Span, Spans, label_span, length_of, line_spans};
use content::{is_parked, shell, unpark, unpark_held};
use definitions::{borrowed_definitions, clear_definitions, masks_of};
use ease::emphasised;
use found::{Form, Found, Pairing, found, holds_subject, pair};
use line::{LineCarry, reroutes};
use plan::{Mover, Plan, Riding, Wiring};
use ride::{Ride, mark_of};
use spark::{DrawOn, redrawn, rims};
use unfold::{Doors, Inside, Unfold};

pub(crate) use departure::departing;
pub use departure::{Heading, departure, visible_at};
pub(crate) use ease::phase;
pub use entrance::{Entrance, Handover};
#[cfg(test)]
pub(crate) use phases::fixtures::PHASES;
pub use phases::{Entry, Phases, Transition};

/// Some items without what belongs to some subjects: their groups, and the
/// shadows they cast.
pub(crate) fn without(items: &[Item], subjects: &HashSet<String>) -> Vec<Item> {
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
    /// The largest door that opens in the move.
    opening: Option<Unfold>,
    /// Where the move ends, as a share of its time: past 1, while a spark runs.
    length: f64,
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
    spans: &Spans<'_>,
    phases: Transition,
) -> Option<Mover> {
    if let Some(&span) = spans.get(new.id).filter(|_| old.form() == new.form()) {
        return Some(redrawn(old, new, span, phases));
    }
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
            Some(line) => Some(Mover::Line(Box::new(line), ground)),
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

/// The lines that a spark draws in a move, which are those that change their shape
/// and those only the next scene has, by their places in the next scene. A line
/// inside a door rides in with the door.
fn drawn_lines(
    (old, new): (&[Found<'_>], &[Found<'_>]),
    pairing: &Pairing,
    doors: &Doors,
    scene: &Scene,
    phases: Transition,
) -> Vec<(usize, Span)> {
    let lines =
        |&&(a, b): &&(usize, usize)| old[a].form() == Form::Line && new[b].form() == Form::Line;
    let changed = pairing
        .shared
        .iter()
        .filter(lines)
        .filter(|&&(a, b)| reroutes(old[a].group, new[b].group))
        .map(|&(_, b)| b);
    let added = pairing
        .added
        .iter()
        .copied()
        .filter(|&b| new[b].form() == Form::Line && doors.carrying(&new[b]).is_none());
    let drawn: Vec<usize> = changed.chain(added).collect();
    line_spans(new, &drawn, scene, (phases.draw_start, phases.draw_end))
}

/// The mover of a subject only the next scene has.
fn arriving(new: &Found<'_>, doors: &Doors, spans: &Spans<'_>, phases: Transition) -> Mover {
    if let Some(unfold) = doors.carrying(new) {
        let fade = if new.is_label() {
            (phases.labels_start, 1.0)
        } else {
            (phases.inside_start, phases.inside_end)
        };
        return Mover::Inside(Box::new(Inside::arriving(new.group.clone(), unfold, fade)));
    }
    let span = spans.get(new.id).copied();
    if new.form() == Form::Line {
        let span = span.unwrap_or((phases.enter_start, 1.0));
        return Mover::Draw(DrawOn::new(new.group, span, phases.arrowhead_at));
    }
    let (start, end) = if new.is_label() {
        span.map_or((phases.labels_start, 1.0), label_span)
    } else {
        (phases.enter_start, 1.0)
    };
    Mover::Grow(Grow::new(new, start, end))
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

/// The mover of a subject only the last scene had.
fn leaving(old: &Found<'_>, doors: &Doors, phases: Transition) -> Mover {
    doors.taking(old).map_or_else(
        || Mover::Leave(Leave::new(old, phases)),
        |unfold| {
            let fade = (0.0, phases.inside_end);
            Mover::Inside(Box::new(Inside::leaving(old.group.clone(), unfold, fade)))
        },
    )
}

/// What of the last picture stops with no subject to carry it: the pulses of a
/// line that stops, which go where the lines stand, and what is parked for a card
/// that does not stay. `pulses` says how deep the pulses stand, and when they end.
fn stopping(
    traffic: &HashMap<&str, &Group>,
    landing: &HashMap<&str, &Group>,
    parked: &[Group],
    moved: &HashMap<&str, (f64, f64)>,
    pulses: (usize, f64),
) -> Vec<(usize, Mover)> {
    let (lines_at, gone_by) = pulses;
    let stays = |owner: &String| moved.contains_key(owner.as_str());
    traffic
        .iter()
        .filter(|(line, _)| !landing.contains_key(*line))
        .map(|(_, group)| {
            let pulses = Item::Group((*group).clone());
            (lines_at, Mover::Leave(Leave::plain(pulses, gone_by)))
        })
        .chain(
            parked
                .iter()
                .filter(|group| !group.members.first().is_some_and(stays))
                .map(|group| {
                    let item = Item::Group(group.clone());
                    (0, Mover::Leave(Leave::plain(item, LABEL_GONE_BY)))
                }),
        )
        .collect()
}

/// Every line's pulses among some items, to any depth.
fn traffic_in<'a>(items: &'a [Item], found: &mut HashMap<&'a str, &'a Group>) {
    for item in items {
        match item {
            Item::Group(group) => match &group.role {
                Role::Traffic(line) => {
                    if mark_of(group).is_some() {
                        found.insert(line, group);
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
    traffic: HashMap<&'a str, &'a Group>,
    /// The shadows and marks of the last frame, with their visibility.
    parked: &'a [Group],
    /// The new subjects that ride inside a door, by id.
    inside: HashMap<&'a str, Unfold>,
    /// When a spark draws each line it draws.
    spans: &'a Spans<'a>,
    /// Where the move ends.
    length: f64,
}

/// What moves a shadow. It rides under the card that casts it, or inside the door
/// that card rides in, and one that nothing carries comes in with what is new.
fn shadow_of(
    item: &Item,
    group: &Group,
    last: &LastPicture<'_>,
    phases: Transition,
) -> Option<Mover> {
    let owner = group.members.first()?;
    if let Some(&span) = last.spans.get(owner.as_str()) {
        let (start, end) = label_span(span);
        return Some(Mover::Frame(item.clone(), start, end));
    }
    let ground = last
        .parked
        .iter()
        .find(|old| old.role == group.role && old.members == group.members)
        .and_then(|old| Ground::new(old, group, phases));
    match last.moved.get(owner.as_str()) {
        Some(&(0.0, 0.0)) => ground.map(|ground| Mover::Visible(group.clone(), ground)),
        Some(&back) => Some(Mover::Riding(Box::new(Riding {
            shadow: group.clone(),
            back,
            start: phases.move_start,
            end: phases.move_end,
            ground,
        }))),
        None => Some(match last.inside.get(owner.as_str()) {
            Some(&unfold) => {
                let fade = (phases.inside_start, phases.inside_end);
                Mover::Inside(Box::new(Inside::arriving(group.clone(), unfold, fade)))
            }
            None => Mover::Frame(item.clone(), phases.labels_start, 1.0),
        }),
    }
}

/// What moves a shadow, a line's pulses or the marks where routes join. Pulses run
/// on, and those of a new line start once it is drawn. The marks stand where the
/// routes land, so they come in as the lines arrive.
fn furniture_of(item: &Item, last: &LastPicture<'_>, phases: Transition) -> Option<Mover> {
    let Item::Group(group) = item else {
        return None;
    };
    match &group.role {
        Role::Junctions => {
            let end = last.length;
            Some(Mover::Frame(item.clone(), phases.labels_start * end, end))
        }
        Role::Shadow(_) => shadow_of(item, group, last, phases),
        Role::Traffic(line) => {
            mark_of(group)?;
            if let Some(&(_, end)) = last.spans.get(line.as_str()) {
                let span = 1.0 - phases.arrowhead_at;
                return Some(Mover::Frame(item.clone(), end, end + span));
            }
            match last.traffic.get(line.as_str()) {
                Some(&old) if old == group => None,
                Some(&old) => Ride::new(old, group, phases).map(|ride| Mover::Ride(Box::new(ride))),
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

/// Temporary shapes left over a picture, such as rims, fade where they stood.
fn stopping_shapes<'a>(
    last: &'a Scene,
    next: &'a Scene,
    end: f64,
) -> impl Iterator<Item = (usize, Mover)> + 'a {
    last.body.iter().filter_map(move |item| {
        let temporary = matches!(item, Item::Shape(_))
            || matches!(item, Item::Group(group) if group.role == Role::Marks && !holds_subject(item, &|_| true));
        let leaving = temporary && !next.body.contains(item);
        leaving.then(|| {
            (
                next.body.len(),
                Mover::Leave(Leave::plain(item.clone(), end)),
            )
        })
    })
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
        let doors = Doors::of(&old, &new, &pairing, phases);
        let times = drawn_lines((&old, &new), &pairing, &doors, &next, phases);
        let length = length_of(times.iter().map(|&(_, span)| span));
        let spans: Spans<'_> = times.iter().map(|&(at, span)| (new[at].id, span)).collect();
        let moved: HashMap<&str, (f64, f64)> = pairing
            .shared
            .iter()
            .filter(|&&(a, b)| old[a].form() == Form::Card && new[b].form() == Form::Card)
            .filter_map(|&(a, b)| {
                let (from, to) = (old[a].frame?, new[b].frame?);
                let lifted = crosses(from, to) || spans.contains_key(new[b].id);
                let rides = !(new[b].is_label() && lifted);
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
                    &spans,
                    phases,
                ),
            )
        });
        let arrivals = pairing
            .added
            .iter()
            .map(|&b| (b, Some(arriving(&new[b], &doors, &spans, phases))));
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
        landing.retain(|line, _| !spans.contains_key(line));
        let pulses = (depth_of(&next.body, SubjectKind::Edge), phases.exit_end);
        let stopping = stopping(&traffic, &landing, &parked, &moved, pulses);
        let known = LastPicture {
            moved,
            traffic,
            parked: &parked,
            inside: doors.inside(&new, &pairing.added),
            spans: &spans,
            length,
        };
        let furniture = |item: &Item, _: bool| furniture_of(item, &known, phases);
        let wiring = Wiring {
            of_subject: &of_subject,
            furniture: &furniture,
        };
        let mut plan = Plan::new(&next.body, movers, &wiring);
        plan.cover(rims(&new, &times));
        let mut leavers: Vec<(usize, Mover)> = pairing
            .removed
            .iter()
            .map(|&a| {
                let leave = leaving(&old[a], &doors, phases);
                (depth_of(&next.body, old[a].subject.kind), leave)
            })
            .chain(stopping)
            .chain(stopping_shapes(&last, &next, phases.exit_end))
            .collect();
        leavers.sort_by_key(|&(place, _)| place);
        for (inserted, (place, mover)) in leavers.into_iter().enumerate() {
            plan.insert(place + inserted, mover);
        }
        let length = plan.length();
        Between {
            plan,
            landed: to.body.clone(),
            definitions: borrowed_definitions(&last, to),
            shift,
            phases,
            opening: doors.focus(),
            length,
        }
    }

    /// Where the move ends, as a share of its time.
    pub(crate) fn length(&self) -> f64 {
        self.length
    }

    /// The box of the door that opens at a progress, in the picture's units, when
    /// a door opens.
    pub(crate) fn opening_at(&self, progress: f64) -> Option<Rect> {
        self.opening.map(|unfold| unfold.box_at(progress))
    }

    /// The in-between at a progress from 0 to its length, as a scene body.
    ///
    /// At its length it is the next scene's body. What the move parks, a line's
    /// ports, comes back on landing.
    pub fn at(&self, progress: f64) -> Vec<Item> {
        if progress >= self.length {
            return self.landed.clone();
        }
        let progress = progress.max(0.0);
        let body = self.plan.at(progress);
        // The camera already moved by the shift. The picture starts that far
        // back and eases home with the cards, so the shared cards stay still.
        let back = self.back_at(progress);
        if back == (0.0, 0.0) {
            return body;
        }
        let mut around = Group::new(Role::Move, body);
        around.transform = Some(Transform::translate(-back.0, -back.1));
        vec![Item::Group(around)]
    }

    /// How far back of its place the picture stands at a progress.
    fn back_at(&self, progress: f64) -> (f64, f64) {
        let phases = self.phases;
        let left = 1.0 - emphasised(phase(progress, phases.move_start, phases.move_end));
        (self.shift.0 * left, self.shift.1 * left)
    }

    /// The in-between at a progress as a scene, and how far back of its place it
    /// stands. A picture that arrives during a move starts from it, so that it
    /// takes over from what the reader sees.
    pub fn seen_at(&self, progress: f64, landed: &Scene) -> (Scene, (f64, f64)) {
        if progress >= self.length {
            return (landed.clone(), (0.0, 0.0));
        }
        let masks = self.masks_at(progress);
        let mut definitions = self.definitions.clone();
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
