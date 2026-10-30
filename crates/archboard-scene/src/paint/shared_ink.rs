//! The ink of a route that another route of its trunk draws. Routes of one
//! kind that lie on one line are a trunk: one drawn line, whose ink the
//! heaviest of them draws (then the earliest painted), so a trunk shows one
//! stroke, one dash pattern and one arrowhead.

use std::collections::BTreeMap;

use crate::drawing::{Edge, Emphasis};
use crate::geometry::{Curve, EPSILON, Point, Segment, segment_start};
use crate::js;

/// Two straight pieces closer than this across their axis draw as one line.
const SHARED_INK: f64 = 2.0;

/// The axis a straight piece runs along.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Axis {
    X,
    Y,
}

/// A point's position on an axis.
fn get(point: Point, axis: Axis) -> f64 {
    match axis {
        Axis::X => point.x,
        Axis::Y => point.y,
    }
}

/// The other axis.
fn across(axis: Axis) -> Axis {
    match axis {
        Axis::X => Axis::Y,
        Axis::Y => Axis::X,
    }
}

/// Which route of several on one line draws it: the heaviest.
fn weight(emphasis: Emphasis) -> f64 {
    match emphasis {
        Emphasis::Hero => 2.0,
        Emphasis::Normal => 1.0,
        Emphasis::Muted => 0.0,
    }
}

/// One axis-aligned straight piece in the original paint order.
#[derive(Clone, Copy, Debug)]
struct Run {
    edge_index: usize,
    from: Point,
    to: Point,
    axis: Axis,
}

/// Which coordinate changes on a nonzero orthogonal line.
fn straight_axis(from: Point, to: Point) -> Option<Axis> {
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

/// The straight pieces of every route, in paint order and then route order.
fn straight_runs(edges: &[Edge]) -> Vec<Run> {
    let mut runs = Vec::new();
    for (edge_index, edge) in edges.iter().enumerate() {
        for (segment_index, segment) in edge.curve.segments.iter().enumerate() {
            let Segment::Line { to } = segment else {
                continue;
            };
            let from = segment_start(&edge.curve, segment_index);
            let Some(axis) = straight_axis(from, *to) else {
                continue;
            };
            runs.push(Run {
                edge_index,
                from,
                to: *to,
                axis,
            });
        }
    }
    runs
}

/// The coordinate a run keeps.
fn fixed_of(run: &Run) -> f64 {
    get(run.from, across(run.axis))
}

/// Where a run lies along its own axis, lowest coordinate first.
fn extent_of(run: &Run) -> (f64, f64) {
    let from = get(run.from, run.axis);
    let to = get(run.to, run.axis);
    (js::js_min(from, to), js::js_max(from, to))
}

/// Whether two runs of different routes lie on one drawn line.
fn on_line(a: &Run, b: &Run) -> bool {
    a.edge_index != b.edge_index
        && a.axis == b.axis
        && (fixed_of(a) - fixed_of(b)).abs() <= SHARED_INK
}

/// Whether two runs are one drawn line: on one line, and relationships of one kind.
fn same_ink(edges: &[Edge], a: &Run, b: &Run) -> bool {
    on_line(a, b) && edges[a.edge_index].edge.kind == edges[b.edge_index].edge.kind
}

/// Whether one route draws the ink it shares with another: the heavier, then the earlier.
fn outranks(edges: &[Edge], a: usize, b: usize) -> bool {
    let difference = weight(edges[a].edge.emphasis) - weight(edges[b].edge.emphasis);
    difference > 0.0 || (difference == 0.0 && a < b)
}

/// Overlapping stretches along one line, joined.
fn merged_stretches(stretches: &[(f64, f64)]) -> Vec<(f64, f64)> {
    let mut merged: Vec<(f64, f64)> = Vec::new();
    for stretch in stretches {
        match merged.last_mut() {
            Some(last) if stretch.0 <= last.1 => last.1 = js::js_max(last.1, stretch.1),
            _ => merged.push(*stretch),
        }
    }
    merged
}

/// A point of a run with its coordinate on the run's axis set.
fn with_axis(point: Point, axis: Axis, value: f64) -> Point {
    match axis {
        Axis::X => Point { x: value, ..point },
        Axis::Y => Point { y: value, ..point },
    }
}

/// The stretches of one run another route of its trunk draws.
fn drawn_for_run(edges: &[Edge], runs: &[Run], run: &Run) -> Vec<Curve> {
    let (low, high) = extent_of(run);
    let mut stretches: Vec<(f64, f64)> = runs
        .iter()
        .filter(|other| {
            same_ink(edges, run, other) && outranks(edges, other.edge_index, run.edge_index)
        })
        .filter_map(|other| {
            let (their_low, their_high) = extent_of(other);
            let from = js::js_max(low, their_low);
            let to = js::js_min(high, their_high);
            (to - from > SHARED_INK).then_some((from, to))
        })
        .collect();
    stretches.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    merged_stretches(&stretches)
        .into_iter()
        .map(|(from, to)| Curve {
            from: with_axis(run.from, run.axis, from),
            segments: vec![Segment::Line {
                to: with_axis(run.from, run.axis, to),
            }],
        })
        .collect()
}

/// Whether two turns are the same turn drawn twice: both ends in one place.
fn same_turn(a: &Curve, b: &Curve) -> bool {
    let ends = [a.from, a.segments[0].to()];
    [b.from, b.segments[0].to()].iter().all(|point| {
        ends.iter()
            .any(|end| js::hypot(end.x - point.x, end.y - point.y) <= SHARED_INK)
    })
}

/// For each route's index, the stretches and turns of its ink another route draws.
pub(super) fn shared_ink(edges: &[Edge]) -> BTreeMap<usize, Vec<Curve>> {
    let runs = straight_runs(edges);
    let turns: Vec<(usize, Curve)> = edges
        .iter()
        .enumerate()
        .flat_map(|(edge_index, edge)| {
            edge.curve
                .segments
                .iter()
                .enumerate()
                .filter(|(_, segment)| matches!(segment, Segment::Cubic { .. }))
                .map(move |(index, segment)| {
                    (
                        edge_index,
                        Curve {
                            from: segment_start(&edge.curve, index),
                            segments: vec![*segment],
                        },
                    )
                })
        })
        .collect();
    let mut shared = BTreeMap::new();
    for edge_index in 0..edges.len() {
        let mut pieces: Vec<Curve> = runs
            .iter()
            .filter(|run| run.edge_index == edge_index)
            .flat_map(|run| drawn_for_run(edges, &runs, run))
            .collect();
        pieces.extend(
            turns
                .iter()
                .filter(|(index, turn)| {
                    *index == edge_index
                        && turns.iter().any(|(other_index, other)| {
                            *other_index != edge_index
                                && edges[*other_index].edge.kind == edges[edge_index].edge.kind
                                && outranks(edges, *other_index, edge_index)
                                && same_turn(turn, other)
                        })
                })
                .map(|(_, turn)| turn.clone()),
        );
        if !pieces.is_empty() {
            shared.insert(edge_index, pieces);
        }
    }
    shared
}
