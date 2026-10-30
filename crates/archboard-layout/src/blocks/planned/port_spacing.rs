//! Reserve distinct lines across opposite walls before accepting a route.

use super::{model::Model, shape::Shape};
use crate::{blocks::assembly::PlacedLine, geometry::Point, track::chains::LANE};

/// How far apart two lines at opposite walls of one card must stand to read
/// as two lines, not as one line behind the card: one lane, the gap between
/// two parallel lines.
const APART: f64 = LANE;

const OFFSETS: [f64; 4] = [APART, -APART, 2.0 * APART, -2.0 * APART];

fn end(points: &[Point], source: bool) -> (Point, Point) {
    if source {
        (points[0], points[1])
    } else {
        (points[points.len() - 1], points[points.len() - 2])
    }
}

fn endpoint(model: &Model<'_>, edge: usize, source: bool) -> usize {
    if source {
        model.ends[edge].0
    } else {
        model.ends[edge].1
    }
}

fn opposite_offset((at, next): (Point, Point), (other, away): (Point, Point)) -> Option<f64> {
    let horizontal = at.y == next.y && other.y == away.y;
    let vertical = at.x == next.x && other.x == away.x;
    if horizontal && (next.x - at.x) * (away.x - other.x) < 0.0 {
        Some(other.y - at.y)
    } else if vertical && (next.y - at.y) * (away.y - other.y) < 0.0 {
        Some(other.x - at.x)
    } else {
        None
    }
}

fn conflicts_at(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    source: bool,
    old: &PlacedLine,
) -> bool {
    let other = model.edge_index[old.id.as_str()];
    edge != other
        && [true, false].into_iter().any(|os| {
            endpoint(model, edge, source) == endpoint(model, other, os)
                && opposite_offset(end(points, source), end(&old.points, os))
                    .is_some_and(|by| by.abs() < APART)
        })
}

pub(super) fn conflicts(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    old: &PlacedLine,
) -> bool {
    [true, false]
        .into_iter()
        .any(|source| conflicts_at(model, edge, points, source, old))
}

pub(super) fn clear(model: &Model<'_>, routes: &[PlacedLine]) -> bool {
    routes.iter().enumerate().all(|(i, line)| {
        let edge = model.edge_index[line.id.as_str()];
        routes[i + 1..]
            .iter()
            .all(|other| !conflicts(model, edge, &line.points, other))
    })
}

fn offsets(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
    source: bool,
    peers: &[&PlacedLine],
) -> Vec<f64> {
    let mut offsets = OFFSETS.map(|by| if source { by } else { -by }).to_vec();
    let (at, next) = end(points, source);
    let horizontal = at.y == next.y;
    let (lo, hi) = wall_span(model, shape, edge, source, horizontal);
    let position = if horizontal { at.y } else { at.x };
    offsets.extend([lo - position, hi - position]);
    for old in peers {
        let other = model.edge_index[old.id.as_str()];
        for os in [true, false] {
            if edge == other || endpoint(model, edge, source) != endpoint(model, other, os) {
                continue;
            }
            if let Some(by) = opposite_offset(end(points, source), end(&old.points, os)) {
                offsets.extend([by + APART, by - APART]);
            }
        }
    }
    let mut seen = rustc_hash::FxHashSet::default();
    offsets.retain(|by| by.abs() > 0.1 && seen.insert(by.to_bits()));
    offsets
}

/// Slide an endpoint run and keep its bends and remaining corridor.
pub(super) fn alternatives(model: &Model<'_>, shape: &Shape, line: &PlacedLine) -> Vec<PlacedLine> {
    let edge = model.edge_index[line.id.as_str()];
    let (from, to) = model.ends[edge];
    let peers: Vec<_> = shape
        .routes
        .iter()
        .filter(|old| {
            let (a, b) = model.ends[model.edge_index[old.id.as_str()]];
            a == from || a == to || b == from || b == to
        })
        .collect();
    let mut paths = vec![line.points.clone()];
    for source in [true, false] {
        if !peers
            .iter()
            .any(|old| conflicts_at(model, edge, &line.points, source, old))
        {
            continue;
        }
        let mut shifted = Vec::new();
        let offsets = offsets(model, shape, edge, &line.points, source, &peers);
        for points in &paths {
            for &offset in &offsets {
                if let Some(path) = slide(model, shape, edge, points, source, offset) {
                    shifted.push(path);
                }
            }
        }
        paths.extend(shifted);
        let mut seen = rustc_hash::FxHashSet::default();
        paths.retain(|path| {
            seen.insert(
                path.iter()
                    .map(|p| [p.x.to_bits(), p.y.to_bits()])
                    .collect::<Vec<_>>(),
            )
        });
    }
    let mut alternatives: Vec<_> = paths
        .into_iter()
        .skip(1)
        .filter(|points| !peers.iter().any(|old| conflicts(model, edge, points, old)))
        .map(|points| PlacedLine {
            id: line.id.clone(),
            label: line
                .label
                .filter(|&label| super::channel::label_run(&points, label)),
            points,
        })
        .collect();
    let movement = |path: &PlacedLine| {
        [true, false]
            .into_iter()
            .map(|source| {
                super::geometry::length(&[end(&line.points, source).0, end(&path.points, source).0])
            })
            .sum::<f64>()
    };
    alternatives.sort_by(|a, b| {
        movement(a).total_cmp(&movement(b)).then_with(|| {
            super::geometry::length(&a.points).total_cmp(&super::geometry::length(&b.points))
        })
    });
    alternatives
}

fn slide(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
    source: bool,
    offset: f64,
) -> Option<Vec<Point>> {
    // A straight run moves both ends. Never move an authored flow point.
    if (source || points.len() == 2)
        && model.edges[edge]
            .option(crate::graph::FROM_POINTS)
            .is_some()
    {
        return None;
    }
    let (at, next) = end(points, source);
    let horizontal = at.y == next.y;
    let mut path = points.to_vec();
    let count = path.len();
    let run = if source {
        &mut path[..2]
    } else {
        &mut path[count - 2..]
    };
    for point in run {
        if horizontal {
            point.y += offset;
        } else {
            point.x += offset;
        }
    }
    let inside = [true, false]
        .into_iter()
        .filter(|&end| end == source || points.len() == 2)
        .all(|end_source| {
            let (at, _) = end(&path, end_source);
            let (lo, hi) = wall_span(model, shape, edge, end_source, horizontal);
            let position = if horizontal { at.y } else { at.x };
            position >= lo && position <= hi
        });
    inside.then_some(path)
}

fn wall_span(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    source: bool,
    horizontal: bool,
) -> (f64, f64) {
    let card = shape.endpoints[&endpoint(model, edge, source)];
    let margin = if source { 12.0 } else { 20.0 };
    let (start, span) = if horizontal {
        (card.y, card.height)
    } else {
        (card.x, card.width)
    };
    (start + margin, start + span - margin)
}
