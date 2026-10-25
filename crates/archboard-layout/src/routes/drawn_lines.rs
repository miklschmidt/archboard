//! The lines a reader sees, as opposed to the routes that draw them
//! (`drawn-lines.ts`). Routes of one kind that lie on one line are a trunk:
//! one drawn line, whose ink the heaviest of them draws (then the earliest
//! painted). Crossings are between drawn lines, and each line's straight runs
//! are what a hop may stand on.
//!
//! A run, a line and a crossing are named by their index into the lists this
//! module builds, so two of them are one where the TypeScript compared them by
//! identity.

use archboard_scene::drawing::{DrawingEdge, EdgeFacts, Emphasis};
use archboard_scene::geometry::{Curve, EPSILON, Point, Segment, segment_start};

use crate::constants::APPROACH_STRAIGHT;
use crate::ecma::{js_max, js_min, min, sign};

/// Two straight pieces closer than this across their axis draw as one line.
const SHARED_INK: f64 = 2.0;

/// The routes of a drawing, as this pass reads them.
pub(super) type Edges = [DrawingEdge<EdgeFacts>];

/// Which coordinate a straight piece runs along.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Axis {
    /// Across the page: x changes.
    X,
    /// Down the page: y changes.
    Y,
}

impl Axis {
    /// The other axis.
    pub(super) fn across(self) -> Axis {
        match self {
            Axis::X => Axis::Y,
            Axis::Y => Axis::X,
        }
    }

    /// A point's coordinate on this axis.
    pub(super) fn of(self, point: Point) -> f64 {
        match self {
            Axis::X => point.x,
            Axis::Y => point.y,
        }
    }

    /// A point with its coordinate on this axis replaced.
    pub(super) fn with(self, point: Point, value: f64) -> Point {
        match self {
            Axis::X => Point { x: value, ..point },
            Axis::Y => Point { y: value, ..point },
        }
    }
}

/// How much each emphasis weighs.
pub(super) fn weight(emphasis: Emphasis) -> f64 {
    match emphasis {
        Emphasis::Hero => 2.0,
        Emphasis::Normal => 1.0,
        Emphasis::Muted => 0.0,
    }
}

/// One axis-aligned straight piece in the original paint order.
#[derive(Clone, Debug)]
pub(super) struct Run {
    pub(super) edge_index: usize,
    pub(super) segment_index: usize,
    pub(super) from: Point,
    pub(super) to: Point,
    pub(super) axis: Axis,
    pub(super) length: f64,
    /// Straight line kept clear at its start: an arrowhead's approach at a
    /// route's end, none at a bend.
    pub(super) start_room: f64,
    /// Straight line kept clear at its end.
    pub(super) end_room: f64,
}

/// One drawn line at a crossing: the run that draws its ink there, and every
/// run sharing that ink, the run it was found from first.
#[derive(Clone, Debug)]
pub(super) struct Line {
    pub(super) drawer: usize,
    pub(super) members: Vec<usize>,
}

/// Two drawn lines crossing on straight ink: the line across, then the line down.
#[derive(Clone, Debug)]
pub(super) struct DrawnCrossing {
    pub(super) point: Point,
    pub(super) lines: [Line; 2],
}

/// Where a run lies along its own axis, lowest coordinate first.
#[derive(Clone, Copy, Debug)]
pub(super) struct Extent {
    pub(super) low: f64,
    pub(super) high: f64,
}

/// Which coordinate changes on a nonzero orthogonal piece, or nothing for a
/// diagonal or a point. Engine coordinates carry floating noise, so a piece
/// straight to the eye is straight here.
pub(super) fn straight_axis(from: Point, to: Point) -> Option<Axis> {
    let dx = (to.x - from.x).abs();
    let dy = (to.y - from.y).abs();
    if dy < EPSILON && dx >= EPSILON {
        return Some(Axis::X);
    }
    if dx < EPSILON && dy >= EPSILON {
        return Some(Axis::Y);
    }
    None
}

/// The straight pieces a hop can stand on, in paint order and then route order.
pub(super) fn straight_runs(edges: &Edges) -> Vec<Run> {
    let mut runs = Vec::new();
    for (edge_index, edge) in edges.iter().enumerate() {
        let last = edge.curve.segments.len().saturating_sub(1);
        for (segment_index, segment) in edge.curve.segments.iter().enumerate() {
            let Segment::Line { to } = *segment else {
                continue;
            };
            let from = segment_start(&edge.curve, segment_index);
            let Some(axis) = straight_axis(from, to) else {
                continue;
            };
            runs.push(Run {
                edge_index,
                segment_index,
                from,
                to,
                axis,
                length: (axis.of(to) - axis.of(from)).abs(),
                start_room: if segment_index == 0 {
                    APPROACH_STRAIGHT
                } else {
                    0.0
                },
                end_room: if segment_index == last {
                    APPROACH_STRAIGHT
                } else {
                    0.0
                },
            });
        }
    }
    runs
}

/// The coordinate a run keeps: its y when it runs across, its x when it runs down.
pub(super) fn fixed_of(run: &Run) -> f64 {
    run.axis.across().of(run.from)
}

/// Where a run lies along its own axis, without the straight line each end
/// keeps clear when `rooms` asks.
pub(super) fn extent_of(run: &Run, rooms: bool) -> Extent {
    let from = run.axis.of(run.from);
    let to = run.axis.of(run.to);
    let forward = to >= from;
    let (first, last) = if forward {
        (run.start_room, run.end_room)
    } else {
        (run.end_room, run.start_room)
    };
    let low = js_min(from, to);
    let high = js_max(from, to);
    if rooms {
        Extent {
            low: low + first,
            high: high - last,
        }
    } else {
        Extent { low, high }
    }
}

/// How far along a run, from its start, a coordinate on its axis lies:
/// negative before the start.
pub(super) fn along(run: &Run, coordinate: f64) -> f64 {
    (coordinate - run.axis.of(run.from)) * sign(run.axis.of(run.to) - run.axis.of(run.from))
}

/// A point following the run's direction, displaced toward a hop's side: up
/// from a line across, right of a line down.
pub(super) fn on_run(run: &Run, distance: f64, height: f64) -> Point {
    let direction = sign(run.axis.of(run.to) - run.axis.of(run.from));
    match run.axis {
        Axis::X => Point {
            x: run.from.x + direction * distance,
            y: run.from.y - height,
        },
        Axis::Y => Point {
            x: run.from.x + height,
            y: run.from.y + direction * distance,
        },
    }
}

/// A straight piece of a run, centred on a place along it, as far as the run goes.
pub(super) fn piece_of(run: &Run, at: f64, reach: f64) -> Curve {
    Curve {
        from: on_run(run, js_max(0.0, at - reach), 0.0),
        segments: vec![Segment::Line {
            to: on_run(run, js_min(run.length, at + reach), 0.0),
        }],
    }
}

/// Whether two runs of different routes lie on one drawn line: they run the
/// same way this close across.
fn on_line(a: &Run, b: &Run) -> bool {
    a.edge_index != b.edge_index
        && a.axis == b.axis
        && (fixed_of(a) - fixed_of(b)).abs() <= SHARED_INK
}

/// Whether two runs are one drawn line: on one line, and relationships of one kind.
fn same_ink(edges: &Edges, a: &Run, b: &Run) -> bool {
    on_line(a, b) && edges[a.edge_index].edge.kind == edges[b.edge_index].edge.kind
}

/// Whether one route draws the ink it shares with another: the heavier, then the earlier.
fn outranks(edges: &Edges, a: usize, b: usize) -> bool {
    let weight = weight(edges[a].edge.emphasis) - weight(edges[b].edge.emphasis);
    weight > 0.0 || (weight == 0.0 && a < b)
}

/// Whether a coordinate lies strictly inside a run, not at either end.
fn holds(run: &Run, coordinate: f64) -> bool {
    let Extent { low, high } = extent_of(run, false);
    coordinate > low + EPSILON && coordinate < high - EPSILON
}

/// The drawn line a run is part of at one coordinate.
fn line_at(edges: &Edges, runs: &[Run], run: usize, coordinate: f64) -> Line {
    let mut members = vec![run];
    members.extend((0..runs.len()).filter(|&other| {
        same_ink(edges, &runs[run], &runs[other]) && holds(&runs[other], coordinate)
    }));
    let mut drawer = members[0];
    for &member in &members[1..] {
        if outranks(edges, runs[member].edge_index, runs[drawer].edge_index) {
            drawer = member;
        }
    }
    Line { drawer, members }
}

/// A proper perpendicular crossing between two straight pieces of different
/// routes: shared endpoints, collinear overlaps and existing corners are not
/// crossings.
fn crosses(upper: &Run, lower: &Run) -> bool {
    if upper.axis == lower.axis || upper.edge_index == lower.edge_index {
        return false;
    }
    let at = along(upper, fixed_of(lower));
    let beneath = along(lower, fixed_of(upper));
    !(js_min(at, upper.length - at) <= EPSILON
        || js_min(beneath, lower.length - beneath) <= EPSILON)
}

/// Every place two drawn lines cross on straight ink, once each: where a run
/// across and a run down cross, and both draw their lines there, since every
/// member of a trunk crosses and its drawer stands for all of them.
pub(super) fn drawn_crossings(edges: &Edges, runs: &[Run]) -> Vec<DrawnCrossing> {
    let mut crossings = Vec::new();
    for row in (0..runs.len()).filter(|&row| runs[row].axis == Axis::X) {
        for down in 0..runs.len() {
            if runs[down].axis != Axis::Y || !crosses(&runs[row], &runs[down]) {
                continue;
            }
            let point = Point {
                x: fixed_of(&runs[down]),
                y: fixed_of(&runs[row]),
            };
            let lines = [
                line_at(edges, runs, row, point.x),
                line_at(edges, runs, down, point.y),
            ];
            if lines[0].drawer == row && lines[1].drawer == down {
                crossings.push(DrawnCrossing { point, lines });
            }
        }
    }
    crossings
}

/// Every run on a run's drawn line, of any kind, itself first.
pub(super) fn line_runs<'a>(runs: &'a [Run], run: &'a Run) -> Vec<&'a Run> {
    let mut line = vec![run];
    line.extend(runs.iter().filter(|other| on_line(run, other)));
    line
}

/// Whether a drawn line runs straight and alone through a stretch: every run
/// on that line which reaches into the stretch holds all of it, clear of its
/// ends' approaches, so nothing bends, joins, parts or ends there.
pub(super) fn straight_through(runs: &[Run], run: &Run, low: f64, high: f64) -> bool {
    line_runs(runs, run).into_iter().all(|other| {
        let whole = extent_of(other, false);
        if whole.high <= low + EPSILON || whole.low >= high - EPSILON {
            return true;
        }
        let clear = extent_of(other, true);
        clear.low <= low + EPSILON && clear.high >= high - EPSILON
    })
}

/// Whether a drawn line joins or parts within reach of a coordinate: one of
/// its routes ends inside another route's run on that line there, where the
/// painter draws a junction mark.
pub(super) fn join_near(runs: &[Run], run: &Run, coordinate: f64, reach: f64) -> bool {
    let line = line_runs(runs, run);
    line.iter().any(|one| {
        let Extent { low, high } = extent_of(one, false);
        [low, high]
            .into_iter()
            .any(|end| (end - coordinate).abs() <= reach && ends_inside(&line, one, end))
    })
}

/// Whether a run's end lies inside another route's run on the same line, clear
/// of that run's own ends: two routes a hair apart that turn together are one
/// line turning, not a join.
fn ends_inside(line: &[&Run], one: &Run, end: f64) -> bool {
    line.iter().any(|other| {
        let span = extent_of(other, false);
        other.edge_index != one.edge_index
            && end > span.low + SHARED_INK
            && end < span.high - SHARED_INK
    })
}

/// How far a drawn line runs straight and alone on either side of a
/// coordinate: the shorter of the two stretches.
pub(super) fn straightness(runs: &[Run], run: &Run, coordinate: f64) -> f64 {
    min(line_runs(runs, run).into_iter().map(|other| {
        let whole = extent_of(other, false);
        if coordinate <= whole.low || coordinate >= whole.high {
            return js_max(whole.low - coordinate, coordinate - whole.high);
        }
        let clear = extent_of(other, true);
        js_min(coordinate - clear.low, clear.high - coordinate)
    }))
}
