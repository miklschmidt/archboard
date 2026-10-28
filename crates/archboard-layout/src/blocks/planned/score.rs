//! Packing compares the exact owned channels that emission expands.

use super::geometry::length;
use super::model::Model;
use super::runs::Frozen;
use super::shape::{Axis, Shape};
use super::topology::Topology;
use crate::blocks::assembly::PlacedLine;
use crate::constants::fit_in;
use crate::geometry::Point;

/// Five percent of additional magnification is one pane-shrink unit.
const PANE_SHRINK_UNIT: f64 = 0.05;

pub(super) fn cost(model: &Model<'_>, topology: &Topology, shape: &Shape, frozen: &Frozen) -> f64 {
    let edges = shape.drawing.edges.len().max(1) as f64;
    let width = (shape.endpoints.values().map(|at| at.width).sum::<f64>()
        / shape.endpoints.len().max(1) as f64)
        .max(1.0);
    let labels = shape
        .drawing
        .edges
        .iter()
        .filter(|edge| edge.label.is_some())
        .count()
        .max(1) as f64;
    let label_distance: f64 = shape.drawing.edges.iter().map(source_distance).sum();
    let bends: usize = shape
        .drawing
        .edges
        .iter()
        .map(|edge| edge.points.len().saturating_sub(2))
        .sum();
    let backwards: f64 = shape
        .drawing
        .edges
        .iter()
        .map(|line| {
            let edge = model
                .edges
                .iter()
                .position(|edge| edge.id == line.id)
                .expect("a real relationship");
            let axis = shape.scopes[&topology.routes[edge].scope].axis;
            steps(&line.points, axis)
        })
        .sum();
    30.0 * shape.empty / shape.occupied.max(1.0)
        + 25.0 * frozen.owned_length() / (edges * width)
        + 18.0 * frozen.junctions() as f64 / edges
        + 10.0 * label_distance / (labels * width)
        + 10.0 * backwards / edges
        + 7.0 * (1.0 / fit_in(shape.drawing.width, shape.drawing.height).max(0.001) - 1.0)
            / PANE_SHRINK_UNIT
        + 2.0 * bends as f64 / edges
}

fn steps(points: &[Point], axis: Axis) -> f64 {
    let (Some(first), Some(last)) = (points.first(), points.last()) else {
        return 0.0;
    };
    if axis == Axis::Down {
        f64::from(last.y < first.y)
    } else {
        f64::from(last.x < first.x) + 0.1
    }
}

/// Distance along the actual private departure, not a center-to-center estimate.
fn source_distance(line: &PlacedLine) -> f64 {
    let Some(label) = line.label else {
        return 0.0;
    };
    let middle = Point {
        x: label.x + label.width / 2.0,
        y: label.y + label.height / 2.0,
    };
    let mut before = 0.0;
    for pair in line.points.windows(2) {
        if (pair[0].y - middle.y).abs() < 1e-6
            && (pair[1].y - middle.y).abs() < 1e-6
            && middle.x >= pair[0].x.min(pair[1].x)
            && middle.x <= pair[0].x.max(pair[1].x)
        {
            return before + (middle.x - pair[0].x).abs();
        }
        before += length(pair);
    }
    f64::INFINITY
}
