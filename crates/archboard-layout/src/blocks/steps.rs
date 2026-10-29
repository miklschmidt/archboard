//! Steps a joined line need not take, taken out (visual polish). A line that
//! passes several blocks is joined from a piece routed in each, and each piece
//! was routed before the others stood beside it: where two pieces meet at a
//! port that lines up with neither, or where a block's tracks turned the line
//! for something that is out of the way once the blocks stand together, the
//! joined line steps sideways and on. Once the drawing is joined, each such
//! step is taken out by sliding the run between its two turns onto the
//! column, or row, of the run before or after it. A slide is kept only where
//! the line's new stretch keeps clear of every card, title, label, other line
//! and wall, crosses no more lines and no wall it did not cross, and still
//! runs straight through the line's own label: no turn comes within a bend's
//! radius of the label, since a turn rounds that far along each run it joins
//! and a label on the curve sits off its line. A run other lines share, a
//! trunk, moves only with all of them and only where none runs much longer
//! for it.

use rustc_hash::FxHashSet;

use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::ecma::{abs, js_max, js_min, number_key, round, sign, via_text};
use crate::geometry::{Point, Rect, inflate};
use crate::track::chains::{LANE, REGION_CLEARANCE};
use crate::track::scene::Map;

use super::laid::corners;

/// How close two coordinates are and still one.
const SAME: f64 = 0.5;
/// How far a trunk keeps from a block it passes.
const TRUNK_CLEARANCE: f64 = 16.0;
/// How far a line's new stretch keeps from another line's label.
const LABEL_CLEARANCE: f64 = LANE / 2.0;
/// The shortest run between two turns, whose two bends need room.
const SHORTEST: f64 = 2.0 * BEND_RADIUS;
/// The shortest last run after a turn: its bend, and the straight run its arrowhead needs.
const SHORTEST_ARRIVAL: f64 = BEND_RADIUS + APPROACH_STRAIGHT;
/// How far apart two lines on one axis still read as one.
const HANDOFF: f64 = 4.0 * LANE;
/// How much longer a slide may make a line it moves.
const CARRIED: f64 = 24.0 * LANE;
/// How many times every line is looked at again, after the others moved.
const PASSES: usize = 3;

/// A run read along its axis: where across it stands, and its low and high ends along.
#[derive(Clone, Copy, Debug)]
struct Span {
    level: bool,
    at: f64,
    low: f64,
    high: f64,
}

/// A run read along its axis.
fn span_of(from: Point, to: Point) -> Span {
    let level = abs(from.y - to.y) < abs(from.x - to.x);
    let (one, other) = if level {
        (from.x, to.x)
    } else {
        (from.y, to.y)
    };
    Span {
        level,
        at: if level { from.y } else { from.x },
        low: js_min(one, other),
        high: js_max(one, other),
    }
}

/// A line's runs, each read along its axis.
fn spans_of(points: &[Point]) -> impl Iterator<Item = Span> {
    points.windows(2).map(|pair| span_of(pair[0], pair[1]))
}

/// How far along two spans share; negative when they are apart.
fn shared(one: &Span, other: &Span) -> f64 {
    js_min(one.high, other.high) - js_max(one.low, other.low)
}

/// Whether two spans lie on one line and share some of it.
fn on_one(one: &Span, other: &Span) -> bool {
    one.level == other.level && abs(one.at - other.at) < SAME && shared(one, other) > SAME
}

/// The stretches of a span no span on its line covers.
fn uncovered(span: Span, cover: &[Span]) -> Vec<Span> {
    let mut left = vec![span];
    for one in cover.iter().filter(|other| on_one(&span, other)) {
        left = left
            .into_iter()
            .flat_map(|piece| {
                [
                    Span {
                        high: js_min(piece.high, one.low),
                        ..piece
                    },
                    Span {
                        low: js_max(piece.low, one.high),
                        ..piece
                    },
                ]
            })
            .filter(|piece| piece.high - piece.low > SAME)
            .collect();
    }
    left
}

/// The stretches of one line's runs another line's runs do not cover.
fn fresh(line: &[Point], cover: &[Point]) -> Vec<Span> {
    let covering: Vec<_> = spans_of(cover).collect();
    spans_of(line)
        .flat_map(|span| uncovered(span, &covering))
        .collect()
}

/// Whether a span runs through a box.
fn through(span: &Span, at: &Rect) -> bool {
    let (low, high, across, deep) = if span.level {
        (at.x, at.x + at.width, at.y, at.height)
    } else {
        (at.y, at.y + at.height, at.x, at.width)
    };
    span.at > across && span.at < across + deep && span.high > low && span.low < high
}

/// Whether a value lies along a span, clear of its ends.
fn within(value: f64, span: &Span) -> bool {
    value > span.low + 1.0 && value < span.high - 1.0
}

/// Whether two square spans cross, each through the other clear of its ends.
fn crosses(one: &Span, other: &Span) -> bool {
    within(other.at, one) && within(one.at, other)
}

/// A box's four walls.
fn wall_spans(at: &Rect) -> [Span; 4] {
    let (right, bottom) = (at.x + at.width, at.y + at.height);
    [
        Span {
            level: true,
            at: at.y,
            low: at.x,
            high: right,
        },
        Span {
            level: true,
            at: bottom,
            low: at.x,
            high: right,
        },
        Span {
            level: false,
            at: at.x,
            low: at.y,
            high: bottom,
        },
        Span {
            level: false,
            at: right,
            low: at.y,
            high: bottom,
        },
    ]
}

/// A run's length.
fn length_of(from: Point, to: Point) -> f64 {
    abs(to.x - from.x) + abs(to.y - from.y)
}

/// Whether two spans are one.
fn same_span(one: &Span, other: &Span) -> bool {
    one.level == other.level
        && abs(one.at - other.at) < SAME
        && abs(one.low - other.low) < SAME
        && abs(one.high - other.high) < SAME
}

/// Whether two points are one.
fn same_point(one: Point, other: Point) -> bool {
    abs(one.x - other.x) < SAME && abs(one.y - other.y) < SAME
}

/// A line as the steps read it: its points and its label's box.
pub(crate) struct Drawn<'a> {
    pub points: &'a [Point],
    pub label: Option<Rect>,
}

/// What every line keeps clear of.
pub(crate) struct Surroundings<'a> {
    /// Every card, title row and caption.
    pub boxes: &'a [Rect],
    /// Every container's and group region's box.
    pub walls: &'a [Rect],
    /// The band across each container's top its title stands in, which only an upright run crosses.
    pub bands: &'a [Rect],
}

/// The lines one slide moves, by index, with their points after it.
type Moved = Map<usize, Vec<Point>>;

/// Everything a slide is weighed against. All its moved lines share the same
/// other runs; obstacle lists stay borrowed from the drawing.
struct Weighing<'a, 'w> {
    others: Vec<Span>,
    weigher: &'a Weigher<'w>,
}

/// What one line is weighed against, given the lines a slide moves.
struct Weigher<'w> {
    runs: Vec<Vec<Span>>,
    boxes: Vec<Rect>,
    labels: Vec<Option<Rect>>,
    /// Each line's own label, grown by a bend's radius.
    own: Vec<Option<Rect>>,
    bands: Vec<Rect>,
    walls: &'w [Rect],
}

impl Weigher<'_> {
    /// Read unchanged runs once for the whole slide, for both clearance and cost.
    fn weigh(&self, moved: &Moved) -> Weighing<'_, '_> {
        Weighing {
            others: self
                .runs
                .iter()
                .enumerate()
                .filter(|(at, _)| !moved.contains_key(at))
                .flat_map(|(_, spans)| spans.iter().copied())
                .collect(),
            weigher: self,
        }
    }
}

/// Where a line crosses other lines, once for each place.
fn crossings(points: &[Point], others: &[Span]) -> usize {
    let mut places: FxHashSet<(u64, u64)> = FxHashSet::default();
    for span in spans_of(points) {
        for other in others.iter().filter(|one| one.level != span.level) {
            let (level, upright) = if span.level {
                (&span, other)
            } else {
                (other, &span)
            };
            if crosses(level, upright) {
                places.insert((
                    number_key(via_text(round(upright.at))),
                    number_key(via_text(round(level.at))),
                ));
            }
        }
    }
    places.len()
}

/// Whether a stretch runs beside another nearer than a lane, or on the
/// other's axis end to end with it.
fn beside(span: &Span, other: &Span) -> bool {
    let apart = abs(other.at - span.at);
    if apart < BEND_RADIUS {
        return shared(span, other) > -HANDOFF;
    }
    apart < LANE && shared(span, other) > -SAME
}

/// Whether a new stretch of a line crowds another line.
fn crowds(span: &Span, others: &[Span]) -> bool {
    others.iter().any(|other| {
        if other.level == span.level {
            return beside(span, other);
        }
        let near_end = js_min(abs(span.at - other.low), abs(span.at - other.high));
        crosses(span, other) && near_end < LANE + BEND_RADIUS
    })
}

/// How many times a line crosses each wall.
fn wall_crossings(points: &[Point], walls: &[Rect]) -> Vec<usize> {
    let spans: Vec<_> = spans_of(points).collect();
    walls
        .iter()
        .map(|at| {
            let edges = wall_spans(at);
            spans
                .iter()
                .map(|span| {
                    edges
                        .iter()
                        .filter(|edge| edge.level != span.level && crosses(span, edge))
                        .count()
                })
                .sum()
        })
        .collect()
}

/// The way a run runs, as the sign of its step in x and y.
fn way_of(from: Point, to: Point) -> (u64, u64) {
    (
        number_key(sign(to.x - from.x)),
        number_key(sign(to.y - from.y)),
    )
}

/// Whether a line leaves and meets its cards the way it did.
fn keeps_ends(next: &[Point], old: &[Point]) -> bool {
    let (n, o) = (next.len(), old.len());
    way_of(next[0], next[1]) == way_of(old[0], old[1])
        && way_of(next[n - 2], next[n - 1]) == way_of(old[o - 2], old[o - 1])
}

/// Whether every run between two turns a slide made or changed has room for
/// its bends, and the last run after a turn room for its bend and its arrowhead.
fn roomy(next: &[Point], old: &[Point]) -> bool {
    next.windows(2).enumerate().skip(1).all(|(index, pair)| {
        let shortest = if index + 2 == next.len() {
            SHORTEST_ARRIVAL
        } else {
            SHORTEST
        };
        length_of(pair[0], pair[1]) >= shortest
            || spans_of(old).any(|span| same_span(&span, &span_of(pair[0], pair[1])))
    })
}

/// A line with the run between two turns slid onto the axis of a run two before or after it.
fn slid(points: &[Point], index: usize, onto: Point) -> Vec<Point> {
    let upright = abs(points[index].x - points[index + 1].x) < SAME;
    points
        .iter()
        .enumerate()
        .map(|(at, &point)| {
            if at != index && at != index + 1 {
                point
            } else if upright {
                Point {
                    x: onto.x,
                    y: point.y,
                }
            } else {
                Point {
                    x: point.x,
                    y: onto.y,
                }
            }
        })
        .collect()
}

/// One slide: the run between two turns, by its index, and the point whose axis it slides onto.
struct Slide {
    at: usize,
    onto: Point,
}

/// Every slide that takes a step out of a line. A line's first and last runs
/// meet cards and never vanish.
fn slides_of(points: &[Point]) -> Vec<Slide> {
    let count = points.len();
    let mut out = Vec::new();
    let mut at = 1;
    // The run from `at` to `at + 1` has a turn on either side, and the point
    // it slides onto is neither end of the line.
    while at + 3 <= count {
        for onto in [at - 1, at + 2] {
            if onto > 0 && onto + 1 < count {
                out.push(Slide {
                    at,
                    onto: points[onto],
                });
            }
        }
        at += 1;
    }
    out
}

/// Where a line runs the same run between two turns as another: the run's index.
fn run_in(route: &[Point], run: (Point, Point)) -> Option<usize> {
    (0..route.len()).find(|&at| {
        at > 0
            && at + 2 < route.len()
            && same_point(route[at], run.0)
            && same_point(route[at + 1], run.1)
    })
}

/// The lines one slide moves: the line, and every line sharing a stretch it
/// moves, which slides the same run with it; nothing when a sharer cannot follow.
fn trunk_of(
    routes: &[Vec<Point>],
    line: usize,
    slide: &Slide,
    runs: &[Vec<Span>],
) -> Option<Moved> {
    let route = &routes[line];
    let run = (route[slide.at], route[slide.at + 1]);
    let mut moved: Moved = Map::default();
    moved.insert(line, corners(&slid(route, slide.at, slide.onto)));
    let mut member = 0;
    while member < moved.len() {
        let (&index, next) = moved.get_index(member).expect("a moved line");
        let gone = fresh(&routes[index], next);
        for (other, points) in routes.iter().enumerate() {
            if moved.contains_key(&other) || !shares_any(&runs[other], &gone) {
                continue;
            }
            let at = run_in(points, run)?;
            moved.insert(other, corners(&slid(points, at, slide.onto)));
        }
        member += 1;
    }
    Some(moved)
}

/// Whether a line runs along any of some stretches.
fn shares_any(runs: &[Span], stretches: &[Span]) -> bool {
    runs.iter()
        .any(|run| stretches.iter().any(|span| on_one(span, run)))
}

/// Whether a slide keeps a line clear of everything around it.
fn keeps_clear(next: &[Point], old: &[Point], weighing: &Weighing<'_, '_>, line: usize) -> bool {
    moves_clear(&fresh(next, old), &fresh(old, next), weighing, line)
        && crossings(next, &weighing.others) <= crossings(old, &weighing.others)
        && wall_crossings(next, weighing.weigher.walls)
            == wall_crossings(old, weighing.weigher.walls)
}

/// Whether what a slide adds to a line and takes from it stays clear.
fn moves_clear(added: &[Span], gone: &[Span], weighing: &Weighing<'_, '_>, line: usize) -> bool {
    let labelled = added
        .iter()
        .chain(gone)
        .any(|span| weighing.weigher.own[line].is_some_and(|label| through(span, &label)));
    !labelled && !added.iter().any(|span| blocked(span, weighing, line))
}

/// Whether a new stretch runs through a box, runs level through a title band,
/// runs along a wall, or crowds another line.
fn blocked(span: &Span, weighing: &Weighing<'_, '_>, line: usize) -> bool {
    let weigher = weighing.weigher;
    weigher.boxes.iter().any(|at| through(span, at))
        || weigher
            .labels
            .iter()
            .enumerate()
            .any(|(at, label)| at != line && label.is_some_and(|at| through(span, &at)))
        || (span.level && weigher.bands.iter().any(|band| through(span, band)))
        || weigher.walls.iter().any(|at| hugs(span, at))
        || crowds(span, &weighing.others)
}

/// Whether a stretch runs along one of a box's walls nearer than a lane and a half.
fn hugs(span: &Span, at: &Rect) -> bool {
    wall_spans(at).iter().any(|wall| {
        wall.level == span.level
            && abs(wall.at - span.at) < REGION_CLEARANCE
            && shared(span, wall) > SAME
    })
}

/// How far a line runs.
fn reach(line: &[Point]) -> f64 {
    line.windows(2)
        .fold(0.0, |sum, pair| sum + length_of(pair[0], pair[1]))
}

/// What a line costs among the others: every crossing before any length.
fn cost_of(line: &[Point], others: &[Span]) -> f64 {
    crossings(line, others) as f64 * 1e6 + reach(line)
}

/// Whether every run stays on one axis within the join tolerance.
fn on_axes(points: &[Point]) -> bool {
    points
        .windows(2)
        .all(|pair| abs(pair[0].x - pair[1].x) < SAME || abs(pair[0].y - pair[1].y) < SAME)
}

/// Whether every line a slide moves keeps its shape, end directions and bend room.
fn fits(moved: &Moved, routes: &[Vec<Point>]) -> bool {
    moved.iter().all(|(&line, next)| {
        let old = &routes[line];
        on_axes(next)
            && reach(next) <= reach(old) + CARRIED
            && keeps_ends(next, old)
            && roomy(next, old)
    })
}

/// What a slide costs: every line it moves, among the lines it does not.
fn slide_cost(moved: &Moved, others: &[Span]) -> f64 {
    moved
        .values()
        .fold(0.0, |sum, next| sum + cost_of(next, others))
}

/// The best slide that takes a step out of a line, if any keeps every line it
/// moves clear: the one crossing fewest lines, then the shortest.
fn best_slide(routes: &[Vec<Point>], line: usize, weigher: &Weigher<'_>) -> Option<Moved> {
    let mut best = None;
    let mut least = f64::INFINITY;
    for slide in slides_of(&routes[line]) {
        let Some(moved) = trunk_of(routes, line, &slide, &weigher.runs) else {
            continue;
        };
        if !fits(&moved, routes) {
            continue;
        }
        let weighing = weigher.weigh(&moved);
        if !moved
            .iter()
            .all(|(&line, next)| keeps_clear(next, &routes[line], &weighing, line))
        {
            continue;
        }
        let cost = slide_cost(&moved, &weighing.others);
        // The original minimum is NaN if any candidate costs NaN, and picks
        // the first candidate for every tie, including an infinite minimum.
        if cost.is_nan() {
            return None;
        }
        if best.is_none() || cost < least {
            least = cost;
            best = Some(moved);
        }
    }
    best
}

/// What every line is weighed against as the lines stand now.
fn weigher_of<'w>(
    lines: &'w [Drawn<'w>],
    routes: &[Vec<Point>],
    around: &Surroundings<'w>,
) -> Weigher<'w> {
    Weigher {
        runs: routes
            .iter()
            .map(|route| spans_of(route).collect())
            .collect(),
        boxes: around
            .boxes
            .iter()
            .map(|&at| inflate(at, TRUNK_CLEARANCE))
            .collect(),
        labels: lines
            .iter()
            .map(|line| line.label.map(|label| inflate(label, LABEL_CLEARANCE)))
            .collect(),
        own: lines
            .iter()
            .map(|line| line.label.map(|label| inflate(label, BEND_RADIUS)))
            .collect(),
        bands: around
            .bands
            .iter()
            .map(|&band| inflate(band, LANE))
            .collect(),
        walls: around.walls,
    }
}

/// Every line with the steps it need not take taken out.
pub(crate) fn unstepped<'w>(lines: &'w [Drawn<'w>], around: &Surroundings<'w>) -> Vec<Vec<Point>> {
    let mut routes: Vec<Vec<Point>> = lines.iter().map(|line| corners(line.points)).collect();
    let mut weigher = weigher_of(lines, &routes, around);
    for _ in 0..PASSES {
        let mut slides = 0;
        for line in 0..routes.len() {
            while let Some(moved) = best_slide(&routes, line, &weigher) {
                for (one, next) in moved {
                    weigher.runs[one] = spans_of(&next).collect();
                    routes[one] = next;
                }
                slides += 1;
            }
        }
        if slides == 0 {
            break;
        }
    }
    routes
}
