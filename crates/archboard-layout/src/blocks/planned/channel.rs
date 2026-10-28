//! Peer-facing wall candidates and local channel templates. No grid search.

use crate::blocks::assembly::PlacedLine;
use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::geometry::{Point, Rect, Side, inflate};

use super::geometry::{clean, contains, crosses_box, intersection, length};
use super::model::Model;
use super::ports::{Port, center, port};
use super::shape::{CLEAR, Shape};
use super::topology::Topology;

/// Only complete routes inside the candidate's reserved space can reach emission.
pub(super) fn emit(
    model: &Model<'_>,
    topology: &Topology,
    scope: usize,
    shape: &mut Shape,
    windows: &mut usize,
) -> bool {
    let hints = super::lanes::corridors(model, topology, scope, shape);
    let order = super::order::fan_order(model, topology, scope, shape);
    for index in order {
        let Some(line) = route_line(
            model,
            topology,
            index,
            shape,
            shape.scopes[&scope].bounds,
            hints.get(&index).copied(),
        )
        .or_else(|| {
            let (line, used) = super::hierarchy::route(
                model,
                topology,
                index,
                shape,
                4usize.saturating_sub(*windows),
            );
            *windows += used;
            shape.fallbacks += used;
            line
        }) else {
            return false;
        };
        shape.drawing.edges.push(line);
    }
    true
}

pub(super) fn departures(
    source: Rect,
    side: Side,
    label: Option<Rect>,
    port: Port,
    escape: f64,
) -> Vec<Vec<Point>> {
    let Some(label) = label else {
        return vec![vec![port.attachment, port.approach]];
    };
    let right = label.x > source.x;
    let y = label.y + label.height / 2.0;
    let beyond = if right {
        label.x + label.width + CLEAR + escape
    } else {
        label.x - CLEAR - escape
    };
    let branch = if right {
        label.x - CLEAR - port.offset
    } else {
        label.x + label.width + CLEAR + port.offset
    };
    let direct = side == if right { Side::Right } else { Side::Left };
    let gap = if right {
        label.x - source.x - source.width
    } else {
        source.x - label.x - label.width
    };
    if gap < 2.0 * CLEAR {
        return if direct {
            vec![vec![port.attachment, Point { x: beyond, y }]]
        } else {
            Vec::new()
        };
    }
    let rows = departure_rows(source, side, direct, port);
    rows.into_iter()
        .map(|row| {
            vec![
                port.attachment,
                port.approach,
                Point {
                    x: port.approach.x,
                    y: row,
                },
                Point { x: branch, y: row },
                Point { x: branch, y },
                Point { x: beyond, y },
            ]
        })
        .collect()
}

fn departure_rows(source: Rect, side: Side, direct: bool, port: Port) -> Vec<f64> {
    if direct || matches!(side, Side::Top | Side::Bottom) {
        vec![port.approach.y]
    } else {
        vec![source.y - CLEAR, source.y + source.height + CLEAR]
    }
}

pub(super) fn route_line(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    bounds: Rect,
    hint: Option<super::lanes::Hint>,
) -> Option<PlacedLine> {
    let label = shape.labels.get(&index).copied();
    if model.edges[index].label_count() > 0 && label.is_none() {
        return None;
    }
    let mut paths = Vec::new();
    for tail in tails(model, index, shape) {
        paths.extend(arrivals(model, index, shape, &tail, bounds, hint));
    }
    paths
        .into_iter()
        .filter(|points| feasible(model, topology, index, shape, points, bounds))
        .enumerate()
        .min_by(|(a, one), (b, other)| {
            path_cost(one, shape, &model.edges[index].id)
                .total_cmp(&path_cost(other, shape, &model.edges[index].id))
                .then(a.cmp(b))
        })
        .map(|(_, points)| PlacedLine {
            id: model.edges[index].id.clone(),
            points,
            label,
        })
}

pub(super) fn path_cost(points: &[Point], shape: &Shape, omit: &str) -> f64 {
    length(points)
        + 60.0 * points.len().saturating_sub(2) as f64
        + 96.0
            * shape
                .drawing
                .edges
                .iter()
                .filter(|line| line.id != omit)
                .map(|line| super::junctions::crossings(points, &line.points))
                .sum::<usize>() as f64
}

fn arrivals(
    model: &Model<'_>,
    index: usize,
    shape: &Shape,
    tail: &[Point],
    bounds: Rect,
    hint: Option<super::lanes::Hint>,
) -> Vec<Vec<Point>> {
    let start = *tail.last().expect("a source approach");
    let mut paths = Vec::new();
    for side in model.endpoints[model.ends[index].1].walls {
        let Some(head) = port(model, index, false, side, shape, start) else {
            continue;
        };
        for middle in connections(start, head.approach, bounds, hint) {
            let mut points = tail.to_vec();
            points.extend(middle);
            points.push(head.attachment);
            paths.push(clean(points));
        }
    }
    paths
}

/// Straight, elbow, and one-channel joins in a fixed candidate order.
fn connections(
    a: Point,
    b: Point,
    bounds: Rect,
    hint: Option<super::lanes::Hint>,
) -> Vec<Vec<Point>> {
    let mut paths = vec![
        vec![a, Point { x: a.x, y: b.y }, b],
        vec![a, Point { x: b.x, y: a.y }, b],
    ];
    for x in [
        f64::midpoint(a.x, b.x),
        bounds.x + CLEAR / 2.0,
        bounds.x + bounds.width - CLEAR / 2.0,
    ] {
        paths.push(vec![a, Point { x, y: a.y }, Point { x, y: b.y }, b]);
    }
    for y in [
        f64::midpoint(a.y, b.y),
        bounds.y + CLEAR / 2.0,
        bounds.y + bounds.height - CLEAR / 2.0,
    ] {
        paths.push(vec![a, Point { x: a.x, y }, Point { x: b.x, y }, b]);
    }
    if let Some(hint) = hint {
        let (one, two) = if hint.horizontal {
            (Point { x: a.x, y: hint.at }, Point { x: b.x, y: hint.at })
        } else {
            (Point { x: hint.at, y: a.y }, Point { x: hint.at, y: b.y })
        };
        paths.insert(0, vec![a, one, two, b]);
    }
    paths
}

pub(super) fn feasible(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    points: &[Point],
    bounds: Rect,
) -> bool {
    let (from, to) = model.ends[index];
    points.len() >= 2
        && approaches(points)
        && points.iter().all(|point| {
            contains(
                bounds,
                Rect {
                    x: point.x,
                    y: point.y,
                    width: 0.0,
                    height: 0.0,
                },
            )
        })
        && shape
            .labels
            .get(&index)
            .is_none_or(|&label| label_run(points, label))
        && shape.endpoints.iter().all(|(&endpoint, &at)| {
            !crosses_box(
                points,
                if endpoint == from || endpoint == to {
                    at
                } else {
                    inflate(at, 16.0)
                },
            )
        })
        && shape
            .labels
            .iter()
            .all(|(&edge, &at)| edge == index || !crosses_box(points, inflate(at, 12.0)))
        && shape
            .drawing
            .regions
            .iter()
            .all(|region| !crosses_box(points, inflate(region.caption, 16.0)))
        && outside_foreign_scopes(model, topology, index, shape, points)
        && super::portals::follows(&topology.routes[index], shape, points)
        && super::ports::reserved(model, index, shape, points)
        && shape
            .drawing
            .edges
            .iter()
            .filter(|line| line.id != model.edges[index].id)
            .all(|line| shared_junction(model, topology, index, points, line))
}

fn outside_foreign_scopes(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    points: &[Point],
) -> bool {
    let route = &topology.routes[index];
    shape.scopes.iter().all(|(&scope, placed)| {
        let bounds = placed.bounds;
        let related = route.outward.contains(&scope)
            || route.inward.contains(&scope)
            || ancestor(model, route.scope, scope);
        related || !crosses_box(points, inflate(bounds, 16.0))
    })
}

pub(super) fn ancestor(model: &Model<'_>, mut inner: usize, outer: usize) -> bool {
    loop {
        if inner == outer {
            return true;
        }
        let Some(parent) = model.scopes[inner].parent else {
            return false;
        };
        inner = parent;
    }
}

/// The final polyline must retain both padded label pins after normalization.
fn label_run(points: &[Point], label: Rect) -> bool {
    let y = label.y + label.height / 2.0;
    points.windows(2).any(|pair| {
        pair[0].y == y
            && pair[1].y == y
            && pair[0].x.min(pair[1].x) <= label.x - 16.0
            && pair[0].x.max(pair[1].x) >= label.x + label.width + 16.0
    })
}

pub(super) fn shared_junction(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    let (overlap, crossing) = intersection(points, &line.points);
    if !overlap && !crossing {
        return true;
    }
    let Some(other) = model.edges.iter().position(|edge| edge.id == line.id) else {
        return false;
    };
    (!overlap
        || topology
            .fans
            .iter()
            .any(|fan| fan.members.contains(&index) && fan.members.contains(&other))
            && super::junctions::sharing(
                points,
                &line.points,
                model.ends[index].0 == model.ends[other].0,
                model.ends[index].1 == model.ends[other].1,
            ))
        && super::junctions::ordered(points, &line.points)
}

pub(super) fn shared_fragment(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    if !intersection(points, &line.points).0 {
        return true;
    }
    let Some(other) = model.edges.iter().position(|edge| edge.id == line.id) else {
        return false;
    };
    model.treatments[edge] == model.treatments[other]
        && (model.ends[edge].0 == model.ends[other].0 || model.ends[edge].1 == model.ends[other].1)
}

/// A higher departure uses the outer lane when both private labels leave downward.
pub(super) fn label_escape(model: &Model<'_>, index: usize, shape: &Shape) -> f64 {
    let Some(label) = shape.labels.get(&index) else {
        return 0.0;
    };
    let from = model.ends[index].0;
    let source = shape.endpoints[&from];
    let left = label.x < source.x;
    let mut siblings: Vec<_> = shape
        .labels
        .iter()
        .filter(|(edge, at)| model.ends[**edge].0 == from && (at.x < source.x) == left)
        .collect();
    siblings.sort_by(|(a, one), (b, other)| one.y.total_cmp(&other.y).then(a.cmp(b)));
    siblings.sort_by(|(_, one), (_, other)| one.y.total_cmp(&other.y));
    let slot = siblings
        .iter()
        .position(|(edge, _)| **edge == index)
        .expect("the owned label");
    let outside = siblings.len() - 1 - slot;
    let width = siblings
        .iter()
        .map(|(_, at)| at.width)
        .fold(label.width, f64::max);
    width - label.width + outside as f64 * crate::track::chains::LANE
}

/// Rounded corners must leave the complete arrow approach after painting.
fn approaches(points: &[Point]) -> bool {
    let required = APPROACH_STRAIGHT + if points.len() > 2 { BEND_RADIUS } else { 0.0 };
    length(&points[..2]) >= required && length(&points[points.len() - 2..]) >= required
}

/// Source labels expose one frozen departure to every local channel choice.
pub(super) fn tails(model: &Model<'_>, index: usize, shape: &Shape) -> Vec<Vec<Point>> {
    if let Some(points) = super::points::departure(model, index, shape) {
        return vec![points];
    }
    if let Some(stem) = shape.stems.get(&index) {
        return vec![stem.clone()];
    }
    let (from, to) = model.ends[index];
    let source = shape.endpoints[&from];
    let target = shape.endpoints[&to];
    let label = shape.labels.get(&index).copied();
    model.endpoints[from]
        .walls
        .into_iter()
        .flat_map(|side| {
            port(
                model,
                index,
                true,
                side,
                shape,
                center(label.unwrap_or(target)),
            )
            .map_or_else(Vec::new, |port| {
                departures(source, side, label, port, label_escape(model, index, shape))
            })
        })
        .collect()
}
