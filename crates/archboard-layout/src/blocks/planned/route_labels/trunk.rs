//! The words of a door's lines, which stand on each line's own branch.

use super::{Model, Own, Point, Rect, Shape, StrokeIndex, spot_on};
use crate::blocks::{assembly::PlacedLine, planned::label_space::Labels};

/// A route read from the part that owns it.
pub(in crate::blocks::planned) fn from_part(path: &[Point], part_first: bool) -> Vec<Point> {
    let mut path = path.to_vec();
    if !part_first {
        path.reverse();
    }
    path
}

/// Seat the words of some lines, in order, each where the others left room, and name
/// the lines that found none. Every other label stays where it stands.
pub(in crate::blocks::planned) fn seat(
    model: &Model<'_>,
    shape: &mut Shape,
    order: &[usize],
) -> Vec<usize> {
    let strokes = StrokeIndex::new(model, shape);
    let mut labels = Labels::new(&shape.labels);
    let mut unseated = Vec::new();
    for &edge in order {
        let line = |item: &PlacedLine| model.edge_index[item.id.as_str()] == edge;
        let Some(index) = shape.routes.iter().position(line) else {
            continue;
        };
        let path = &shape.routes[index].points;
        let spot = |narrow| {
            spot_on(
                model,
                Own::new(edge, path),
                path,
                shape,
                &strokes,
                &labels,
                narrow,
            )
        };
        match spot(false).or_else(|| spot(true)) {
            Some((label, _)) => {
                shape.labels.insert(edge, label);
                labels.remember(edge, label);
                shape.routes[index].label = Some(label);
            }
            None => unseated.push(edge),
        }
    }
    unseated
}

/// The box of each line's branch: the stretches it runs on alone.
pub(in crate::blocks::planned) fn branches(
    model: &Model<'_>,
    shape: &Shape,
    order: &[usize],
) -> Vec<Rect> {
    let strokes = StrokeIndex::new(model, shape);
    let branch = |edge: usize| {
        let line = |line: &&PlacedLine| model.edge_index[line.id.as_str()] == edge;
        let spans = strokes.private(edge, &shape.routes.iter().find(line)?.points);
        let ends = || spans.iter().flat_map(|span| [span.a, span.b]);
        let (x, y) = (ends().map(|at| at.x), ends().map(|at| at.y));
        let (left, top) = (
            x.clone().fold(f64::MAX, f64::min),
            y.clone().fold(f64::MAX, f64::min),
        );
        let (right, bottom) = (x.fold(f64::MIN, f64::max), y.fold(f64::MIN, f64::max));
        (!spans.is_empty()).then_some(Rect {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        })
    };
    order.iter().filter_map(|&edge| branch(edge)).collect()
}
