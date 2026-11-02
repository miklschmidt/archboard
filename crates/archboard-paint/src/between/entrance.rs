//! A picture arriving with nothing to carry it from: the first picture of a
//! page, another picture, another view of this one.
//!
//! A move can carry what two scenes share. Here nothing is shared, so the
//! picture blooms out of its middle instead. Containers open first, so the cards
//! have a floor to land on. The cards come out of the middle in a wave, each from a
//! little nearer the middle and smaller than it lands. Once the cards the lines leave
//! and reach stand there, a spark runs along the connections and draws the lines, and
//! each label arrives when the spark reaches it. Everything is timed by where it is
//! on the picture, not by how many there are, so a picture of four cards and a picture of
//! forty read as the same gesture.
//!
//! A subject the last picture also drew is the same subject. It flies from where
//! the last picture drew it to its place in this one, so the eye keeps hold of
//! something across the change of picture.

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Group, Item, Role, Scene, Transform};

use super::arrive::{Grow, SHOWN_BY};
use super::circuit::{Span, Spans, label_span, length_of, line_spans};
use super::found::{Form, Found, found, holds_subject};
use super::handover::{Handover, Last};
use super::open::{Opening, ways};
use super::phases::{Entry, Phases};
use super::plan::{Mover, Plan, Wiring};
use super::resize::Resizing;
use super::spark::{DrawOn, rims};

/// How far a card starts from its place, as a share of its way to the middle.
const PULL: f64 = 0.16;

/// How far through an entrance a card that flies lands.
const FLOWN_BY: f64 = 0.8;

/// How far along the wave a point is: its distance from the middle. A smaller
/// key arrives sooner.
fn wave_key(point: Point, middle: Point) -> f64 {
    (point.x - middle.x).hypot(point.y - middle.y)
}

/// The middle of a scene.
pub(super) fn middle_of_scene(scene: &Scene) -> Point {
    Point {
        x: scene.width / 2.0,
        y: scene.height / 2.0,
    }
}

/// How far from its place something in a box starts.
fn pull_of(frame: Option<Rect>, middle: Point) -> (f64, f64) {
    frame.map_or((0.0, 0.0), |frame| {
        let own = middle_of(frame);
        ((middle.x - own.x) * PULL, (middle.y - own.y) * PULL)
    })
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
    /// Where the entrance ends, as a share of its time: past 1, while a spark runs.
    length: f64,
    /// The subjects that fly over from the last picture.
    flown: HashSet<String>,
    /// Whether a container of the last picture stays on as a tray of this one.
    keeps_tray: bool,
}

/// The card of each subject. A lifeline stands under the card at its head, which is
/// drawn after it, so the card answers for both.
fn heads<'a, 'b>(groups: &'b [Found<'a>]) -> HashMap<&'a str, &'b Found<'a>> {
    groups
        .iter()
        .filter(|group| group.is_card())
        .map(|group| (group.id, group))
        .collect()
}

/// When each card grows, by its place in the groups: the wave's start and end.
fn card_times(groups: &[Found<'_>], entry: &Entry, middle: Point) -> Vec<(usize, f64, f64)> {
    let places: Vec<usize> = (0..groups.len())
        .filter(|&at| groups[at].is_card())
        .collect();
    let heads = heads(groups);
    let keys: Vec<Option<f64>> = places
        .iter()
        .map(|&at| {
            heads[groups[at].id]
                .frame
                .map(|frame| wave_key(middle_of(frame), middle))
        })
        .collect();
    let begins = spread(&keys, entry.cards_start, entry.cards_start_by);
    places
        .into_iter()
        .zip(begins)
        .map(|(at, begin)| (at, begin, (begin + entry.card_span).min(1.0)))
        .collect()
}

/// The cards, which bloom into place in a wave, each lifeline on its card. Each is
/// placed by its place in the groups.
fn cards(
    groups: &[Found<'_>],
    entry: &Entry,
    middle: Point,
    last: &Last<'_>,
) -> Vec<(usize, Mover)> {
    let heads = heads(groups);
    card_times(groups, entry, middle)
        .into_iter()
        .map(|(at, begin, end)| {
            let group = groups[at].group;
            let card = heads[groups[at].id];
            (at, arriving(group, card, (begin, end), middle, last))
        })
        .collect()
}

/// How a card, or the shadow it casts, arrives: from where it stood, or out of
/// the middle.
fn arriving(
    group: &Group,
    card: &Found<'_>,
    times: (f64, f64),
    middle: Point,
    last: &Last<'_>,
) -> Mover {
    Mover::Grow(last.stood_for(card).map_or_else(
        || {
            Grow::bloom(
                group.clone(),
                card.frame,
                times,
                pull_of(card.frame, middle),
            )
        },
        |(old, new, shown)| {
            Grow::flown(
                group.clone(),
                (old, new),
                (0.0, FLOWN_BY),
                last.shown * shown,
            )
        },
    ))
}

/// When a card stands in its place as a line sees it: in full, and all but settled.
fn stands_by(card: &Found<'_>, (begin, end): (f64, f64), last: &Last<'_>) -> f64 {
    let (begin, end) = if last.stood_for(card).is_some() {
        (0.0, FLOWN_BY)
    } else {
        (begin, end)
    };
    begin + (end - begin) * SHOWN_BY
}

/// When each line is drawn on, by its place in the groups.
fn line_times(
    groups: &[Found<'_>],
    scene: &Scene,
    entry: &Entry,
    there: &dyn Fn(&str) -> f64,
) -> Vec<(usize, Span)> {
    let places: Vec<usize> = (0..groups.len())
        .filter(|&at| groups[at].form() == Form::Line)
        .collect();
    line_spans(
        groups,
        &places,
        scene,
        (entry.lines_start, entry.draw_end),
        there,
    )
}

/// The lines, which a spark draws on once the cards are there.
fn lines(groups: &[Found<'_>], times: &[(usize, Span)], phases: &Phases) -> Vec<(usize, Mover)> {
    let arrowhead = phases.transition.arrowhead_at;
    times
        .iter()
        .map(|&(at, span)| {
            let draw = DrawOn::new(groups[at].group, span, arrowhead);
            (at, Mover::Draw(draw))
        })
        .collect()
}

/// The containers, which open ahead of the cards, and the labels, each of which
/// arrives as the spark reaches it.
fn frames_and_labels(
    groups: &[Found<'_>],
    spans: &Spans<'_>,
    entry: &Entry,
    middle: Point,
    last: &Last<'_>,
) -> Vec<(usize, Mover)> {
    let ways = ways(groups, middle, (0.0, entry.region_span));
    groups
        .iter()
        .enumerate()
        .filter_map(|(at, group)| {
            if let Some(&way) = ways.get(group.id) {
                let mover = last.trays.get(group.id).map_or_else(
                    || Mover::Open(Box::new(Opening::new(group, way))),
                    |&tray| {
                        let resizing = Resizing::new(group, tray, way, last.shown)
                            .holding(last.holder == Some(group.id));
                        Mover::Resize(Box::new(resizing))
                    },
                );
                Some((at, mover))
            } else if group.is_label() {
                let (start, end) = spans
                    .get(group.id)
                    .map_or((entry.labels_start, 1.0), |&span| label_span(span));
                Some((at, Mover::Grow(Grow::new(group, start, end))))
            } else {
                None
            }
        })
        .collect()
}

/// When something that belongs to no subject fades in. A line's pulses start as
/// it ends, the plate under a line's words comes with them, and a mark on the
/// lines comes as the last lines land. The start and the end of a flow stand at its
/// far ends, so they and the shadows they cast come with the last cards. The rest of
/// the page's furniture fades in with the frames, so that nothing stands on its own
/// before the picture arrives.
fn furniture_times(
    item: &Item,
    spans: &Spans<'_>,
    regions: &HashSet<&str>,
    entry: &Entry,
    length: f64,
) -> (f64, f64) {
    let frames = (0.0, entry.frames_end);
    let ends = (entry.cards_start_by, entry.cards_start_by + entry.card_span);
    let Item::Group(group) = item else {
        return frames;
    };
    match &group.role {
        Role::Traffic(line) => {
            let end = spans.get(line.as_str()).map_or(1.0, |span| span.1);
            (end, end + entry.pulse_span)
        }
        Role::Shadow(_) => group.members.first().map_or(ends, |owner| {
            if regions.contains(owner.as_str()) {
                frames
            } else {
                spans
                    .get(owner.as_str())
                    .map_or((entry.labels_start, 1.0), |&span| label_span(span))
            }
        }),
        Role::Junctions => (entry.labels_start * length, length),
        Role::Shape => ends,
        _ => frames,
    }
}

/// A shadow on the card that casts it, the two moving as one.
fn riding(
    item: &Item,
    cards: &HashMap<&str, (usize, f64, f64)>,
    groups: &[Found<'_>],
    middle: Point,
    last: &Last<'_>,
) -> Option<Mover> {
    let Item::Group(group) = item else {
        return None;
    };
    if !matches!(group.role, Role::Shadow(_)) {
        return None;
    }
    let owner = group.members.first()?;
    let &(at, begin, end) = cards.get(owner.as_str())?;
    Some(arriving(group, &groups[at], (begin, end), middle, last))
}

/// What an entrance does with each subject group, and which mover has which.
fn movers(
    groups: &[Found<'_>],
    times: &[(usize, Span)],
    phases: &Phases,
    middle: Point,
    last: &Last<'_>,
) -> (Vec<Mover>, Vec<Option<usize>>) {
    let spans: Spans<'_> = times
        .iter()
        .map(|&(at, span)| (groups[at].id, span))
        .collect();
    let by_place: BTreeMap<usize, Mover> = [
        cards(groups, &phases.entry, middle, last),
        lines(groups, times, phases),
        frames_and_labels(groups, &spans, &phases.entry, middle, last),
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
    /// Prepare the entrance of a scene, taking over from a last picture if there
    /// is one.
    pub fn new(scene: &Scene, phases: &Phases, handover: Option<Handover<'_>>) -> Entrance {
        let groups = found(scene);
        let middle = middle_of_scene(scene);
        let last = Last::of(handover);
        let cards: HashMap<&str, (usize, f64, f64)> = card_times(&groups, &phases.entry, middle)
            .into_iter()
            .map(|(at, begin, end)| (groups[at].id, (at, begin, end)))
            .collect();
        let there = |id: &str| {
            cards.get(id).map_or(0.0, |&(at, begin, end)| {
                stands_by(&groups[at], (begin, end), &last)
            })
        };
        let times = line_times(&groups, scene, &phases.entry, &there);
        let length = length_of(times.iter().map(|&(_, span)| span));
        let (all, of_subject) = movers(&groups, &times, phases, middle, &last);
        let flown = groups
            .iter()
            .filter(|group| {
                last.keeps(group) || (group.is_card() && last.stood_for(group).is_some())
            })
            .map(|group| group.id.to_owned())
            .collect();
        let keeps_tray = groups.iter().any(|group| last.keeps(group));
        let spans: Spans<'_> = times
            .iter()
            .map(|&(at, span)| (groups[at].id, span))
            .collect();
        let regions: HashSet<&str> = groups
            .iter()
            .filter(|group| group.is_region())
            .map(|group| group.id)
            .collect();
        let furniture = |item: &Item, top: bool| {
            let alone = matches!(item, Item::Group(group) if matches!(group.role, Role::Shadow(_) | Role::Junctions | Role::Traffic(_)));
            let page = top
                && !matches!(item, Item::Definitions { .. } | Item::Break)
                && !holds_subject(item, &|_| true);
            (alone || page).then(|| {
                riding(item, &cards, &groups, middle, &last).unwrap_or_else(|| {
                    let (start, end) =
                        furniture_times(item, &spans, &regions, &phases.entry, length);
                    Mover::Frame(item.clone(), start, end)
                })
            })
        };
        let wiring = Wiring {
            of_subject: &of_subject,
            furniture: &furniture,
        };
        let mut plan = Plan::new(&scene.body, all, &wiring);
        plan.cover(rims(&groups, &times));
        let length = plan.length();
        Entrance {
            plan,
            landed: scene.body.clone(),
            length,
            flown,
            keeps_tray,
        }
    }

    /// Say how the last picture's units map onto this picture's: the two can stand
    /// under different cameras.
    pub(crate) fn rebase(&mut self, carry: Transform) {
        self.plan.rebase(carry);
    }

    /// Where the entrance ends, as a share of its time.
    pub(crate) fn length(&self) -> f64 {
        self.length
    }

    /// The subjects that fly over from the last picture.
    pub(crate) fn flown(&self) -> &HashSet<String> {
        &self.flown
    }

    /// Whether a container of the last picture stays on as a tray of this one.
    pub(crate) fn keeps_tray(&self) -> bool {
        self.keeps_tray
    }

    /// The box of the tray the last picture leaves inside, when it has one.
    pub(crate) fn holder_at(&self, progress: f64) -> Option<Rect> {
        self.plan.holder_at(progress)
    }

    /// The picture at a progress from 0 to its length, as a scene body. At its
    /// length it is the scene's body.
    pub fn at(&self, progress: f64) -> Vec<Item> {
        if progress >= self.length {
            self.landed.clone()
        } else {
            self.plan.at(progress.max(0.0))
        }
    }
}
