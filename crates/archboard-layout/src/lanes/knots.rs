//! Knots of join marks, in a Lanes drawing. Where two lines run together the painter marks each
//! place they join or part with a dot, and where two lines cross it draws a hop. Marks that stand
//! within two lanes of each other, or a mark within a hop's reach, read as one knot. A block's
//! routing counts them, and names the lines whose turns stand in one, so that each can be tried
//! on a run of its own (`sides.rs`).

use archboard_scene::geometry::Point;

use crate::ecma::abs;
use crate::lanes::chains::LANE;
use crate::lanes::scene::Map;
use crate::lanes::side_runs::{Run, meets, runs_of, turns};

/// How far apart two join marks stand to read as two joins: two lanes.
const KNOT: f64 = 2.0 * LANE;
/// How far a join mark stands from a hop's middle to read apart from it: the hop and a lane.
const HOP_REACH: f64 = 7.0 + LANE;
/// How far in from where two lines part the painter marks it: a bend's radius.
const BEND: f64 = crate::constants::BEND_RADIUS;

/// Whether a run is level.
fn level(run: Run) -> bool {
    abs(run.0.y - run.1.y) < 0.5
}

/// A run's stretch along its axis, low end first, and where it stands across.
fn stretch(run: Run) -> (f64, f64, f64) {
    if level(run) {
        (run.0.x.min(run.1.x), run.0.x.max(run.1.x), run.0.y)
    } else {
        (run.0.y.min(run.1.y), run.0.y.max(run.1.y), run.0.x)
    }
}

/// A point on a run's axis.
fn on_axis(run: Run, along: f64, across: f64) -> Point {
    if level(run) {
        Point {
            x: along,
            y: across,
        }
    } else {
        Point {
            x: across,
            y: along,
        }
    }
}

/// Where two runs on one axis run together and part: each end of their shared stretch where
/// one runs on and the other does not, held in a bend from the end.
fn shared_ends(a: Run, b: Run) -> Vec<Point> {
    let ((a_low, a_high, a_at), (b_low, b_high, b_at)) = (stretch(a), stretch(b));
    let (low, high) = (a_low.max(b_low), a_high.min(b_high));
    if level(a) != level(b) || abs(a_at - b_at) > 1.0 || high - low <= 1.0 {
        return Vec::new();
    }
    let inward = BEND.min((high - low) / 2.0);
    let ends = [
        (a_low, b_low, low + inward),
        (a_high, b_high, high - inward),
    ];
    (ends.into_iter())
        .filter(|&(one, other, _)| abs(one - other) > 1.0)
        .map(|(_, _, along)| on_axis(a, along, a_at))
        .collect()
}

/// The places two lines join or part where they run together.
fn marks_between(one: &[Run], other: &[Run]) -> Vec<Point> {
    one.iter()
        .flat_map(|&a| other.iter().flat_map(move |&b| shared_ends(a, b)))
        .collect()
}

/// Every join mark of a picture, one per place.
fn marks_of(lines: &[Vec<Run>]) -> Vec<Point> {
    let mut marks: Vec<Point> = Vec::new();
    for (index, one) in lines.iter().enumerate() {
        for other in &lines[index + 1..] {
            for mark in marks_between(one, other) {
                if !marks
                    .iter()
                    .any(|kept| abs(kept.x - mark.x) + abs(kept.y - mark.y) < 2.0)
                {
                    marks.push(mark);
                }
            }
        }
    }
    marks
}

/// Where two runs cross, if they do.
fn crossing(a: Run, b: Run) -> Option<Point> {
    let (flat, upright) = if level(a) { (a, b) } else { (b, a) };
    (meets(a, b) == 1).then_some(Point {
        x: upright.0.x,
        y: flat.0.y,
    })
}

/// Every place two lines cross, where the painter draws a hop.
fn hops_of(lines: &[Vec<Run>]) -> Vec<Point> {
    let pairs = (lines.iter().enumerate())
        .flat_map(|(index, one)| lines[index + 1..].iter().map(move |other| (one, other)));
    pairs
        .flat_map(|(one, other)| {
            one.iter()
                .flat_map(|&a| other.iter().filter_map(move |&b| crossing(a, b)))
        })
        .collect()
}

/// The knots of a picture: marks closer than `KNOT`, and marks closer than `HOP_REACH` to a hop.
fn knots_of(lines: &[Vec<Run>]) -> Vec<Point> {
    let (marks, hops) = (marks_of(lines), hops_of(lines));
    let apart = |one: Point, other: Point| (one.x - other.x).hypot(one.y - other.y);
    let mut knots = Vec::new();
    for (index, &mark) in marks.iter().enumerate() {
        knots.extend(
            marks[index + 1..]
                .iter()
                .filter(|&&other| apart(mark, other) < KNOT)
                .map(|_| mark),
        );
        knots.extend(
            hops.iter()
                .filter(|&&hop| apart(mark, hop) < HOP_REACH)
                .map(|_| mark),
        );
    }
    knots
}

/// The runs of a block's lines, their straight stretches only.
fn runs_by_line(routes: &Map<String, Vec<Point>>) -> Vec<Vec<Run>> {
    routes
        .values()
        .map(|points| runs_of(&turns(points)))
        .collect()
}

/// How many knots a block's lines tie.
pub(crate) fn knots_in(routes: &Map<String, Vec<Point>>) -> usize {
    knots_of(&runs_by_line(routes)).len()
}

/// The lines of a block with a turn in a knot, each once.
pub(crate) fn knotted_lines(routes: &Map<String, Vec<Point>>) -> Vec<String> {
    let knots = knots_of(&runs_by_line(routes));
    let near = |point: Point| {
        knots
            .iter()
            .any(|knot| (knot.x - point.x).hypot(knot.y - point.y) <= KNOT)
    };
    (routes.iter())
        .filter(|(_, points)| {
            let corners = turns(points);
            corners.len() > 2
                && corners[1..corners.len() - 1]
                    .iter()
                    .any(|&corner| near(corner))
        })
        .map(|(id, _)| id.clone())
        .collect()
}
