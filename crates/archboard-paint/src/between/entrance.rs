//! A picture arriving with nothing to carry it from: the first picture of a
//! page, another board, another view of this one.
//!
//! A move can carry what two scenes share. Here nothing is shared, so the
//! picture is built up the way it is read instead. Frames first, fading in, so
//! the pane has its shape. Then the cards, in a wave that runs down the board
//! and a little across it, each growing into place. Then the lines between cards
//! that are already there, drawn from their start. Last, every connection label
//! at once, as the final layer. Everything is timed by where it is on the
//! board, not by how many there are, so a board of four cards and a board of
//! forty take the same time to arrive and read as the same gesture.

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Item, Role, Scene};

use super::arrive::Grow;
use super::found::{Form, Found, found, holds_subject};
use super::line::{DrawOn, start_of};
use super::phases::{Entry, Phases};
use super::plan::{Mover, Plan, Wiring};

/// How much a step across the board counts against a step down it when a
/// card's turn is decided: the wave runs mostly downwards, and leans left to
/// right.
const ACROSS_WEIGHT: f64 = 0.35;

/// How far along the wave a point is. A smaller key arrives sooner.
fn wave_key(point: Point) -> f64 {
    point.y + point.x * ACROSS_WEIGHT
}

/// Where a card sits in the wave: its middle.
fn middle_of(frame: Rect) -> Point {
    Point {
        x: frame.x + frame.width / 2.0,
        y: frame.y + frame.height / 2.0,
    }
}

/// Spread things over a window by where they are in the wave. The first begins
/// at `first` and the last at `last`. A thing that does not say where it is
/// begins with the first.
fn spread(keys: &[Option<f64>], first: f64, last: f64) -> Vec<f64> {
    let known = keys.iter().flatten().copied();
    let low = known.clone().fold(f64::INFINITY, f64::min);
    let range = known.fold(f64::NEG_INFINITY, f64::max) - low;
    keys.iter()
        .map(|key| match key {
            Some(key) if range > 0.0 => first + (key - low) / range * (last - first),
            _ => first,
        })
        .collect()
}

/// A picture coming in part by part, prepared once and sampled every frame.
#[derive(Clone, Debug)]
pub struct Entrance {
    plan: Plan,
    landed: Vec<Item>,
}

/// When each card grows, by its place in the groups: the wave's start and end.
fn card_times(groups: &[Found<'_>], entry: &Entry) -> Vec<(usize, f64, f64)> {
    let places: Vec<usize> = (0..groups.len())
        .filter(|&at| {
            groups[at].form() == Form::Card && !groups[at].is_region() && !groups[at].is_label()
        })
        .collect();
    let keys: Vec<Option<f64>> = places
        .iter()
        .map(|&at| groups[at].frame.map(|frame| wave_key(middle_of(frame))))
        .collect();
    let begins = spread(&keys, entry.cards_start, entry.cards_start_by);
    places
        .into_iter()
        .zip(begins)
        .map(|(at, begin)| (at, begin, (begin + entry.card_span).min(1.0)))
        .collect()
}

/// The cards, which grow into place in a wave. Each is placed by its place in
/// the groups.
fn cards(groups: &[Found<'_>], entry: &Entry) -> Vec<(usize, Mover)> {
    card_times(groups, entry)
        .into_iter()
        .map(|(at, begin, end)| (at, Mover::Grow(Grow::new(&groups[at], begin, end))))
        .collect()
}

/// The lines, which are drawn on in the wave once the cards are there.
fn lines(groups: &[Found<'_>], phases: &Phases) -> Vec<(usize, Mover)> {
    let entry = phases.entry;
    let places: Vec<usize> = (0..groups.len())
        .filter(|&at| groups[at].form() == Form::Line)
        .collect();
    let keys: Vec<Option<f64>> = places
        .iter()
        .map(|&at| start_of(groups[at].group).map(wave_key))
        .collect();
    let begins = spread(&keys, entry.lines_start, entry.lines_start_by);
    places
        .into_iter()
        .zip(begins)
        .map(|(at, begin)| {
            let end = (begin + entry.line_span).min(1.0);
            let arrowhead = phases.transition.arrowhead_at;
            (
                at,
                Mover::Draw(DrawOn::new(groups[at].group, begin, end, arrowhead)),
            )
        })
        .collect()
}

/// The containers, which fade in with the frames, and the labels, which come in
/// together at the end.
fn frames_and_labels(groups: &[Found<'_>], entry: &Entry) -> Vec<(usize, Mover)> {
    groups
        .iter()
        .enumerate()
        .filter_map(|(at, group)| {
            if group.is_region() {
                let frame = Mover::Frame(Item::Group(group.group.clone()), 0.0, entry.frames_end);
                Some((at, frame))
            } else if group.is_label() {
                Some((at, Mover::Grow(Grow::new(group, entry.labels_start, 1.0))))
            } else {
                None
            }
        })
        .collect()
}

/// When something that belongs to no subject fades in. A shadow comes with what
/// casts it, and a mark on the lines comes after the lines. The rest of the page's
/// furniture fades in with the frames, so that nothing stands on its own before the
/// picture arrives.
fn furniture_times(
    item: &Item,
    cards: &HashMap<&str, (f64, f64)>,
    regions: &HashSet<&str>,
    entry: &Entry,
) -> (f64, f64) {
    let frames = (0.0, entry.frames_end);
    let labels = (entry.labels_start, 1.0);
    let Item::Group(group) = item else {
        return frames;
    };
    match group.role {
        Role::Shadow(_) => group.members.first().map_or(frames, |owner| {
            let by_line = if regions.contains(owner.as_str()) {
                frames
            } else {
                labels
            };
            cards.get(owner.as_str()).copied().unwrap_or(by_line)
        }),
        Role::Junctions => labels,
        _ => frames,
    }
}

/// What an entrance does with each subject group, and which mover has which.
fn movers(groups: &[Found<'_>], phases: &Phases) -> (Vec<Mover>, Vec<Option<usize>>) {
    let by_place: BTreeMap<usize, Mover> = [
        cards(groups, &phases.entry),
        lines(groups, phases),
        frames_and_labels(groups, &phases.entry),
    ]
    .into_iter()
    .flatten()
    .collect();
    let mut of_subject = vec![None; groups.len()];
    let mut all = Vec::new();
    for (at, mover) in by_place {
        of_subject[at] = Some(all.len());
        all.push(mover);
    }
    (all, of_subject)
}

impl Entrance {
    /// Prepare the entrance of a scene.
    pub fn new(scene: &Scene, phases: &Phases) -> Entrance {
        let groups = found(scene);
        let silent: HashSet<&str> = groups
            .iter()
            .filter(|group| group.form() == Form::Line)
            .map(|group| group.id)
            .collect();
        let (all, of_subject) = movers(&groups, phases);
        let cards: HashMap<&str, (f64, f64)> = card_times(&groups, &phases.entry)
            .into_iter()
            .map(|(at, begin, end)| (groups[at].id, (begin, end)))
            .collect();
        let regions: HashSet<&str> = groups
            .iter()
            .filter(|group| group.is_region())
            .map(|group| group.id)
            .collect();
        let furniture = |item: &Item, top: bool| {
            let alone = matches!(item, Item::Group(group) if matches!(group.role, Role::Shadow(_) | Role::Junctions));
            let page = top
                && !matches!(item, Item::Definitions { .. } | Item::Break)
                && !holds_subject(item, &|_| true);
            (alone || page).then(|| {
                let (start, end) = furniture_times(item, &cards, &regions, &phases.entry);
                Mover::Frame(item.clone(), start, end)
            })
        };
        let wiring = Wiring {
            of_subject: &of_subject,
            furniture: &furniture,
            silent: &silent,
        };
        Entrance {
            plan: Plan::new(&scene.body, all, &wiring),
            landed: scene.body.clone(),
        }
    }

    /// The picture at a progress from 0 to 1, as a scene body. At 1 it is the
    /// scene's body.
    pub fn at(&self, progress: f64) -> Vec<Item> {
        if progress >= 1.0 {
            self.landed.clone()
        } else {
            self.plan.at(progress.max(0.0))
        }
    }
}
