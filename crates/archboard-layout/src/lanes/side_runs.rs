//! The straight runs of lines, as the side ports of a Lanes drawing weigh them: where two runs
//! cross or lie on top of each other, where a run passes a box, and how often a line turns.

use archboard_scene::geometry::{Point, Rect};

use crate::ecma::{abs, js_max, js_min};
use crate::lanes::chains::LANE;

/// A straight run of a line, from one point to the next.
pub(crate) type Run = (Point, Point);

/// What two runs on top of each other count for in `meets`, so a sum keeps them apart from
/// crossings.
pub(crate) const OVERLAP: usize = 1 << 20;

/// How far a run keeps from a box it passes.
pub(crate) const CLEAR: f64 = LANE / 2.0;

/// A line's straight runs.
pub(crate) fn runs_of(points: &[Point]) -> Vec<Run> {
    points.windows(2).map(|pair| (pair[0], pair[1])).collect()
}

/// Whether a run is level.
fn level(run: Run) -> bool {
    abs(run.0.y - run.1.y) < 0.5
}

/// Whether a value lies between two others, clear of both.
fn between(value: f64, one: f64, other: f64) -> bool {
    value > js_min(one, other) + 0.5 && value < js_max(one, other) - 0.5
}

/// How far two stretches of one axis share.
fn shared((one, other): (f64, f64), (low, high): (f64, f64)) -> f64 {
    js_min(js_max(one, other), js_max(low, high)) - js_max(js_min(one, other), js_min(low, high))
}

/// How two runs meet: `1` where they cross, `OVERLAP` where they lie on top of each other.
pub(crate) fn meets(one: Run, other: Run) -> usize {
    match (level(one), level(other)) {
        (true, false) => usize::from(
            between(other.0.x, one.0.x, one.1.x) && between(one.0.y, other.0.y, other.1.y),
        ),
        (false, true) => meets(other, one),
        (true, true) => {
            usize::from(
                abs(one.0.y - other.0.y) < CLEAR
                    && shared((one.0.x, one.1.x), (other.0.x, other.1.x)) > 0.5,
            ) * OVERLAP
        }
        (false, false) => {
            usize::from(
                abs(one.0.x - other.0.x) < CLEAR
                    && shared((one.0.y, one.1.y), (other.0.y, other.1.y)) > 0.5,
            ) * OVERLAP
        }
    }
}

/// How some runs meet some others, summed.
pub(crate) fn met(own: &[Run], others: &[Run]) -> usize {
    own.iter()
        .map(|&run| others.iter().map(|&other| meets(run, other)).sum::<usize>())
        .sum()
}

/// Whether some runs meet others worse than other runs did: more crossings, or more runs on top
/// of another.
pub(crate) fn worse(new: usize, old: usize) -> bool {
    new % OVERLAP > old % OVERLAP || new / OVERLAP > old / OVERLAP
}

/// Whether a run passes through a box grown by `CLEAR`.
pub(crate) fn through((from, to): Run, bx: &Rect) -> bool {
    js_max(from.x, to.x) > bx.x - CLEAR
        && js_min(from.x, to.x) < bx.x + bx.width + CLEAR
        && js_max(from.y, to.y) > bx.y - CLEAR
        && js_min(from.y, to.y) < bx.y + bx.height + CLEAR
}

/// How many times a line turns.
pub(crate) fn bends(points: &[Point]) -> usize {
    let flat: Vec<bool> = points
        .windows(2)
        .filter(|pair| abs(pair[1].x - pair[0].x) > 0.5 || abs(pair[1].y - pair[0].y) > 0.5)
        .map(|pair| abs(pair[1].x - pair[0].x) > 0.5)
        .collect();
    flat.windows(2).filter(|pair| pair[0] != pair[1]).count()
}

/// How long a line runs.
pub(crate) fn length(points: &[Point]) -> f64 {
    points
        .windows(2)
        .map(|pair| abs(pair[1].x - pair[0].x) + abs(pair[1].y - pair[0].y))
        .sum()
}

/// The stretch of a level run that an arrowhead, or a line's first turn, takes at a face: from
/// the face toward an x, an arrowhead's length or less.
pub(crate) fn at_face(face: f64, toward: f64, y: f64) -> Run {
    let reach = face
        + js_min(crate::constants::APPROACH_STRAIGHT, abs(toward - face))
            * if toward < face { -1.0 } else { 1.0 };
    (Point { x: face, y }, Point { x: reach, y })
}
