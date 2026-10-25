//! The column arithmetic of the relay's route search (visual polish): which
//! columns a station may take, what the other lines in a channel cost each
//! column, and the sweeps down one channel at a time, each column's cheapest
//! cost from the columns on the band above found in one pass each way.

use crate::constants::BEND_RADIUS;
use crate::ecma::abs;
use crate::track::chains::LANE;

/// What a change of column costs a route while it is searched: two bends and the run between them.
const JOG: f64 = 2.0 * LANE;
/// The shortest sideways step a line turns: its two bends.
const MIN_STEP: f64 = 2.0 * BEND_RADIUS;
/// What crossing another line costs, as sideways travel: the detour that makes a lap.
pub(crate) const CROSSING: f64 = 25.0 * LANE;
/// How far inside an interval's edge still counts as outside it.
pub(crate) const EDGE: f64 = 1e-9;

/// An interval of x.
pub(crate) type Span = (f64, f64);

/// One step of the search down a chain: each column's cheapest cost, and the column above it came from.
#[derive(Clone, Debug)]
pub(crate) struct Step {
    pub cost: Vec<f64>,
    pub came: Vec<i32>,
}

/// Let each column be reached from any column at least a whole step to its left.
fn from_left(above: &[f64], warped: &[f64], xs: &[f64], step: &mut Step) {
    let mut best = f64::INFINITY;
    let mut at = -1;
    let mut next = 0;
    for j in 0..xs.len() {
        while next < xs.len() && xs[next] <= xs[j] - MIN_STEP {
            let from = above[next] - warped[next];
            if from < best {
                best = from;
                at = next as i32;
            }
            next += 1;
        }
        let cost = best + warped[j] + JOG;
        if cost < step.cost[j] {
            step.cost[j] = cost;
            step.came[j] = at;
        }
    }
}

/// Let each column be reached from any column at least a whole step to its right.
fn from_right(above: &[f64], warped: &[f64], xs: &[f64], step: &mut Step) {
    let mut best = f64::INFINITY;
    let mut at = -1;
    let mut next = xs.len() as isize - 1;
    for j in (0..xs.len()).rev() {
        while next >= 0 && xs[next as usize] >= xs[j] + MIN_STEP {
            let from = above[next as usize] + warped[next as usize];
            if from < best {
                best = from;
                at = next as i32;
            }
            next -= 1;
        }
        let cost = best - warped[j] + JOG;
        if cost < step.cost[j] {
            step.cost[j] = cost;
            step.came[j] = at;
        }
    }
}

/// Move down one channel: each column's cheapest cost from the column above
/// it, or from one at least a whole step aside.
pub(crate) fn descend(above: &[f64], warped: &[f64], xs: &[f64]) -> Step {
    let mut step = Step {
        cost: above.to_vec(),
        came: (0..above.len() as i32).collect(),
    };
    from_left(above, warped, xs, &mut step);
    from_right(above, warped, xs, &mut step);
    step
}

/// The columns the search went down, from the one it ended on: each station's column, top to bottom.
pub(crate) fn backtrack(steps: &[Vec<i32>], end: usize) -> Vec<usize> {
    let mut chosen = vec![end];
    for came in steps.iter().rev() {
        let first = came[chosen[0]];
        chosen.insert(0, first as usize);
    }
    chosen
}

/// The first index of an ascending list whose value is above a bound.
pub(crate) fn first_above(sorted: &[f64], bound: f64) -> usize {
    let (mut low, mut high) = (0, sorted.len());
    while low < high {
        let middle = usize::midpoint(low, high);
        if sorted[middle] <= bound {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low
}

/// Mark the columns strictly inside an interval as taken.
pub(crate) fn block(free: &mut [bool], xs: &[f64], span: Span) {
    let mut j = first_above(xs, span.0);
    while j < xs.len() && xs[j] < span.1 {
        free[j] = false;
        j += 1;
    }
}

/// Each column's warped x in a channel: its x plus a crossing's worth for
/// every other line's end left of it, each end counting half.
pub(crate) fn warp(xs: &[f64], ends: &[f64]) -> Vec<f64> {
    let mut warped = vec![0.0; xs.len()];
    let mut passed = 0usize;
    for j in 0..xs.len() {
        while passed < ends.len() && ends[passed] < xs[j] {
            passed += 1;
        }
        warped[j] = xs[j] + (CROSSING * passed as f64) / 2.0;
    }
    warped
}

/// How many runs cover each column, strictly inside.
pub(crate) fn spanned(xs: &[f64], runs: &[Span]) -> Vec<f64> {
    let mut counts = vec![0.0; xs.len() + 1];
    for &(low, high) in runs {
        let from = first_above(xs, low + 0.5);
        counts[from] += 1.0;
        let to = first_above(xs, high - 0.5 - EDGE).max(from);
        counts[to] -= 1.0;
    }
    for j in 1..xs.len() {
        counts[j] += counts[j - 1];
    }
    counts.truncate(xs.len());
    counts
}

/// What reaching each column from a card costs: nothing across its face,
/// else the warped travel from the face's nearest edge and a jog.
pub(crate) fn from_reach(xs: &[f64], warped: &[f64], reach: Span) -> Vec<f64> {
    let left = first_above(xs, reach.0 - EDGE);
    let right = first_above(xs, reach.1 - EDGE);
    let mut cost = vec![0.0; warped.len()];
    for j in 0..warped.len() {
        if j >= left && j <= right {
            continue;
        }
        let edge = if j < left { left } else { right };
        // An edge past the last column reads as no number, as an array read past its end does.
        let (at, warp) = (
            xs.get(edge).copied().unwrap_or(f64::NAN),
            warped.get(edge).copied().unwrap_or(f64::NAN),
        );
        let step = abs(at - xs[j]);
        cost[j] = if step < MIN_STEP {
            f64::INFINITY
        } else {
            abs(warp - warped[j]) + JOG
        };
    }
    cost
}
