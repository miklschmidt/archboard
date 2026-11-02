//! A picture arriving with nothing to carry it from: the first picture of a
//! page, another board, another view of this one.
//!
//! A move can carry what two scenes share. Here nothing is shared, so the
//! picture blooms out of its middle instead. Containers open first, so the cards
//! have a floor to land on. The cards come out of the middle in a wave, each from a
//! little nearer the middle and smaller than it lands. Once the cards the lines leave
//! and reach stand there, a spark runs along the connections and draws the lines, and
//! each label arrives when the spark reaches it. Everything is timed by where it is
//! on the board, not by how many there are, so a board of four cards and a board of
//! forty read as the same gesture.
//!
//! A subject the last picture also drew is the same subject. It flies from where
//! the last picture drew it to its place in this one, so the eye keeps hold of
//! something across the change of board.

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

/// When each card grows, by its place in the groups: the wave's start and end.
fn card_times(groups: &[Found<'_>], entry: &Entry, middle: Point) -> Vec<(usize, f64, f64)> {
    let places: Vec<usize> = (0..groups.len())
        .filter(|&at| groups[at].is_card())
        .collect();
    let keys: Vec<Option<f64>> = places
        .iter()
        .map(|&at| {
            groups[at]
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

/// The cards, which bloom into place in a wave. Each is placed by its place in
/// the groups.
fn cards(
    groups: &[Found<'_>],
    entry: &Entry,
    middle: Point,
    last: &Last<'_>,
) -> Vec<(usize, Mover)> {
    card_times(groups, entry, middle)
        .into_iter()
        .map(|(at, begin, end)| {
            let card = &groups[at];
            (at, arriving(card.group, card, (begin, end), middle, last))
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
/// far ends, so they come with the last cards. The rest of the page's furniture fades
/// in with the frames, so that nothing stands on its own before the picture arrives.
fn furniture_times(
    item: &Item,
    spans: &Spans<'_>,
    regions: &HashSet<&str>,
    entry: &Entry,
    length: f64,
) -> (f64, f64) {
    let frames = (0.0, entry.frames_end);
    let Item::Group(group) = item else {
        return frames;
    };
    match &group.role {
        Role::Traffic(line) => {
            let end = spans.get(line.as_str()).map_or(1.0, |span| span.1);
            (end, end + entry.pulse_span)
        }
        Role::Shadow(_) => group.members.first().map_or(frames, |owner| {
            if regions.contains(owner.as_str()) {
                frames
            } else {
                spans
                    .get(owner.as_str())
                    .map_or((entry.labels_start, 1.0), |&span| label_span(span))
            }
        }),
        Role::Junctions => (entry.labels_start * length, length),
        Role::Shape => (entry.cards_start_by, entry.cards_start_by + entry.card_span),
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

#[cfg(test)]
mod tests {
    use archboard_scene::scene::{Group, Item, Role, Scene};

    use super::super::testing::{PHASES, card, drawing, label, line, rect, scene, shadow};
    use super::super::tests::solid;
    use super::super::{Entrance, Handover};

    /// A board of three cards one under another, a line from the first to the
    /// second, the line's label, and a shadow that belongs to no subject.
    fn tall_board() -> Scene {
        let body = vec![
            shadow(),
            card("bottom", rect(10.0, 210.0, 80.0, 40.0), &["C"]),
            card("top", rect(10.0, 10.0, 80.0, 40.0), &["A"]),
            card("middle", rect(10.0, 110.0, 80.0, 40.0), &["B"]),
            line("e", &[(50.0, 50.0), (50.0, 110.0)]),
            label("e", rect(40.0, 70.0, 30.0, 14.0), "calls"),
        ];
        scene(body, &[])
    }

    /// The shadows at the top of a picture that is one group.
    fn shadows_of(body: &[Item]) -> Vec<&Group> {
        let Some(Item::Group(picture)) = body.first() else {
            panic!("the picture is one group");
        };
        picture
            .items
            .iter()
            .filter_map(|item| match item {
                Item::Group(group) if matches!(group.role, Role::Shadow(_)) => Some(group),
                _ => None,
            })
            .collect()
    }

    /// A picture whose cards cast shadows, and whose line casts one too.
    fn cast_board() -> Scene {
        let cast = |owner: &str| {
            let Item::Group(group) = shadow() else {
                unreachable!("a shadow is a group");
            };
            Item::Group(group.standing_with(vec![owner.to_owned()]))
        };
        scene(
            vec![Item::Group(Group::new(
                Role::Move,
                vec![
                    cast("top"),
                    cast("e"),
                    cast("bottom"),
                    card("top", rect(10.0, 10.0, 80.0, 40.0), &["A"]),
                    card("bottom", rect(10.0, 210.0, 80.0, 40.0), &["C"]),
                    line("e", &[(50.0, 50.0), (50.0, 110.0)]),
                ],
            ))],
            &[],
        )
    }

    #[test]
    fn a_shadow_inside_the_picture_waits_for_what_casts_it() {
        let early = Entrance::new(&cast_board(), &PHASES, None).at(0.1);
        let shadows = shadows_of(&early);
        assert_eq!(shadows.len(), 3);
        assert_eq!(solid(shadows[0]), 0.0, "the last card is not there yet");
        assert_eq!(solid(shadows[1]), 0.0, "its line's words come later");
    }

    #[test]
    fn a_card_and_its_shadow_bloom_out_as_one() {
        let early = Entrance::new(&cast_board(), &PHASES, None).at(0.2);
        let shadow = shadows_of(&early)[2];
        let card = drawing(&early, "bottom")[0];
        assert!(solid(card) > 0.0);
        assert_eq!(shadow.transform, card.transform);
        assert_eq!(solid(shadow), solid(card));
    }

    #[test]
    fn an_entrance_opens_from_the_middle_of_the_board() {
        let board = tall_board();
        let early = Entrance::new(&board, &PHASES, None).at(0.1);
        let of = |name: &str| solid(drawing(&early, name)[0]);
        assert!(
            of("middle") > 0.0,
            "the card nearest the middle is on its way"
        );
        assert_eq!(of("top"), 0.0, "the wave has not reached the farthest");
        let ground = early
            .iter()
            .find_map(|item| match item {
                Item::Group(group) if matches!(group.role, Role::Shadow(_)) => Some(group),
                _ => None,
            })
            .expect("the shadow is drawn");
        assert!(
            solid(ground) > 0.0 && solid(ground) < 1.0,
            "what belongs to no subject fades in with the frames"
        );
        let entrance = Entrance::new(&board, &PHASES, None);
        assert_eq!(
            entrance.at(entrance.length()),
            board.body,
            "it lands on the scene itself"
        );
    }

    #[test]
    fn a_card_comes_out_of_the_middle_small_and_lands_where_it_is_drawn() {
        let early = Entrance::new(&tall_board(), &PHASES, None).at(0.12);
        let moved = drawing(&early, "middle")[0].transform.expect("it is moved");
        assert!(moved.scale.is_some_and(|scale| scale < 1.0));
        let (x, _) = (50.0 * moved.scale.unwrap_or(1.0) + moved.x, 0.0);
        assert!(x > 50.0, "it starts nearer the middle than it lands");
    }

    #[test]
    fn a_card_the_last_picture_drew_flies_from_where_it_stood() {
        let was = rect(300.0, 200.0, 80.0, 40.0);
        let last = scene(vec![card("middle", was, &["B"])], &[]);
        let board = tall_board();
        let handover = Handover {
            last: &last,
            shown: 0.5,
        };
        let entrance = Entrance::new(&board, &PHASES, Some(handover));
        assert!(entrance.flown().contains("middle"));
        let start = entrance.at(0.0);
        let flying = drawing(&start, "middle")[0];
        let moved = flying.transform.expect("it stands where it stood");
        assert_eq!((10.0 + moved.x, 110.0 + moved.y), (was.x, was.y));
        assert_eq!(solid(flying), 0.5, "it shows as the last picture does");
        assert_eq!(solid(drawing(&start, "top")[0]), 0.0, "the rest bloom");
    }

    #[test]
    fn no_line_leaves_or_reaches_a_card_before_the_card_shows_in_full() {
        let board = tall_board();
        let entrance = Entrance::new(&board, &PHASES, None);
        let drawn_by = |at: &f64| {
            let body = entrance.at(*at);
            solid(drawing(&body, "e")[0]) > 0.0
        };
        let begins = (0..400)
            .map(|step| f64::from(step) * 0.01)
            .find(drawn_by)
            .expect("it is drawn");
        let body = entrance.at(begins);
        assert_eq!(solid(drawing(&body, "top")[0]), 1.0, "it leaves a card");
        assert_eq!(solid(drawing(&body, "middle")[0]), 1.0, "it reaches one");
    }

    #[test]
    fn an_entrance_draws_the_lines_after_the_cards_and_each_label_as_its_line_reaches_it() {
        let board = tall_board();
        let lines = |progress: f64| {
            let body = Entrance::new(&board, &PHASES, None).at(progress);
            drawing(&body, "e")
                .iter()
                .map(|group| solid(group))
                .collect::<Vec<_>>()
        };
        assert_eq!(lines(0.5), [0.0, 0.0], "no line before the cards");
        let [line, label] = lines(0.7)[..] else {
            panic!("a line and its label")
        };
        assert!(line > 0.0, "the line has begun");
        assert_eq!(label, 0.0, "the spark has not reached its label");
        assert!(lines(1.0)[1] > 0.0, "it arrives as the spark reaches it");
    }
}
