//! How a carry is prepared: the last picture's groups paired with the next
//! one's by subject, each pair given what moves it, and what only one picture
//! has given what brings it in or takes it off.

use std::collections::{BTreeMap, HashMap};

use archboard_geometry::Rect;
use archboard_scene::scene::{Definition, Group, Item, Mask, Role, Scene, SubjectKind};

use super::arrive::{Ground, LABEL_GONE_BY, Leave, Swap, arriving, ready_cards};
use super::card::CardCarry;
use super::circuit::{Span, Spans, label_span, length_of, line_spans};
use super::content::{is_parked, unpark, unpark_held};
use super::definitions::{borrowed_definitions, masks_of};
use super::entrance::middle_of_scene;
use super::found::{Form, Found, Pairing, found, holds_subject, pair};
use super::line::{LineCarry, reroutes};
use super::open::ways;
use super::phases::Transition;
use super::plan::{Mover, Plan, Riding, Wiring};
use super::rename;
use super::resize::resumed;
use super::ride::{Ride, mark_of};
use super::spark::{redrawn, rims};
use super::unfold::{Doors, Inside, Unfold};

/// What a carry prepares once.
pub(super) struct Carried {
    pub(super) plan: Plan,
    /// The definitions the in-between refers to: the next scene's, and the last
    /// scene's under names that cannot collide with them.
    pub(super) definitions: Vec<Definition>,
    /// The largest door that opens in the move.
    pub(super) opening: Option<Unfold>,
    /// Where the move ends, as a share of its time: past 1, while a spark runs.
    pub(super) length: f64,
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
pub(super) fn drawn_lines(
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
    let span = (phases.draw_start, phases.draw_end);
    let ready = ready_cards(old, new, pairing, doors, phases);
    line_spans(new, &drawn, scene, span, &|id| {
        ready.get(id).copied().unwrap_or(0.0)
    })
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
    traffic: &BTreeMap<&str, &Group>,
    landing: &BTreeMap<&str, &Group>,
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

/// Every line's pulses among some items, to any depth, by line, so that what
/// stops goes in the same order every time.
fn traffic_in<'a>(items: &'a [Item], found: &mut BTreeMap<&'a str, &'a Group>) {
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
    traffic: BTreeMap<&'a str, &'a Group>,
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

/// The movers of some subjects, and which mover each subject has.
fn gathered(
    all: impl Iterator<Item = (usize, Option<Mover>)>,
    subjects: usize,
) -> (Vec<Mover>, Vec<Option<usize>>) {
    let mut movers = Vec::new();
    let mut of_subject = vec![None; subjects];
    for (at, mover) in all {
        if let Some(mover) = mover {
            of_subject[at] = Some(movers.len());
            movers.push(mover);
        }
    }
    (movers, of_subject)
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

/// Prepare the carry from `from` to `to`.
pub(super) fn planned(from: &Scene, to: &Scene, phases: Transition) -> Carried {
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
    let middle = middle_of_scene(&next);
    let mut going_on = resumed(&old, &new, &pairing, middle, phases.move_end);
    let carries = pairing.shared.iter().map(|&(a, b)| {
        let masks = (mask_of(&old[a], &last_masks), mask_of(&new[b], &next_masks));
        let masks = (masks.0.as_ref(), masks.1.as_ref());
        let opening = going_on.remove(&b);
        let mover = opening.map(|going_on| Mover::Resize(Box::new(going_on)));
        (
            b,
            mover.or_else(|| carried(&old[a], &new[b], masks, &spans, phases)),
        )
    });
    let added: Vec<Found<'_>> = pairing.added.iter().map(|&b| new[b]).collect();
    let openings = ways(&added, middle, (phases.enter_start, 1.0));
    let arrivals = pairing.added.iter().map(|&b| {
        (
            b,
            Some(arriving(&new[b], &doors, &spans, &openings, phases)),
        )
    });
    let (movers, of_subject) = gathered(carries.chain(arrivals), new.len());
    let mut traffic = BTreeMap::new();
    traffic_in(&last.body, &mut traffic);
    let mut landing = BTreeMap::new();
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
    Carried {
        length: plan.length(),
        plan,
        definitions: borrowed_definitions(&last, to),
        opening: doors.focus(),
    }
}
