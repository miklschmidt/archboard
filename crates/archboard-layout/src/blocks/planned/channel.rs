//! Peer-facing wall candidates and local channel templates. No grid search.

use crate::blocks::assembly::PlacedLine;
use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::geometry::{Point, Rect, Side, inflate};
use crate::graph::FROM_POINTS;

use super::geometry::{clean, contains, crosses_box, intersection, length};
use super::model::Model;
use super::ports::{Port, center, port};
use super::shape::{CLEAR, Shape};
use super::topology::Topology;

/// Bounded source cells hold two adjacent label rows on either side of the card.
pub(super) fn eligible(model: &Model<'_>, topology: &Topology) -> bool {
    !model
        .edges
        .iter()
        .any(|edge| edge.option(FROM_POINTS).is_some())
        && model.ends.iter().all(|&(from, to)| from != to)
        && topology.labels.iter().all(|label| {
            let source = model.ends[label.edge].0;
            let limit = if model.scopes[label.scope].header == Some(source) {
                2
            } else {
                4
            };
            topology
                .labels
                .iter()
                .filter(|other| model.ends[other.edge].0 == source)
                .count()
                <= limit
        })
}

/// Only complete routes inside the candidate's reserved space can reach emission.
pub(super) fn emit(
    model: &Model<'_>,
    topology: &Topology,
    scope: usize,
    shape: &mut Shape,
) -> bool {
    let hints = super::lanes::corridors(model, topology, scope, shape);
    let Some(order) = super::order::fan_order(model, topology, scope, shape) else {
        return false;
    };
    for index in order {
        let Some(line) = route_line(
            model,
            topology,
            index,
            shape,
            shape.scopes[&scope].bounds,
            hints.get(&index).copied(),
        ) else {
            return false;
        };
        shape.drawing.edges.push(line);
    }
    true
}

fn departures(
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
        label.x - CLEAR
    } else {
        label.x + label.width + CLEAR
    };
    let direct = side == if right { Side::Right } else { Side::Left };
    let rows = if direct || matches!(side, Side::Top | Side::Bottom) {
        vec![port.approach.y]
    } else {
        vec![source.y - CLEAR, source.y + source.height + CLEAR]
    };
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

fn route_line(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    bounds: Rect,
    hint: Option<super::lanes::Hint>,
) -> Option<PlacedLine> {
    let (from, to) = model.ends[index];
    let source = shape.endpoints[&from];
    let target = shape.endpoints[&to];
    let label = shape.labels.get(&index).copied();
    if model.edges[index].label_count() > 0 && label.is_none() {
        return None;
    }
    let mut paths = Vec::new();
    for side in model.endpoints[from].walls {
        let Some(source_port) = port(
            model,
            index,
            true,
            side,
            shape,
            center(label.unwrap_or(target)),
        ) else {
            continue;
        };
        for tail in departures(
            source,
            side,
            label,
            source_port,
            label_escape(model, index, shape),
        ) {
            paths.extend(arrivals(model, index, shape, &tail, bounds, hint));
        }
    }
    paths
        .into_iter()
        .filter(|points| feasible(model, topology, index, shape, points, bounds))
        .enumerate()
        .min_by(|(a, one), (b, other)| path_cost(one).total_cmp(&path_cost(other)).then(a.cmp(b)))
        .map(|(_, points)| PlacedLine {
            id: model.edges[index].id.clone(),
            points,
            label,
        })
}

fn path_cost(points: &[Point]) -> f64 {
    length(points) + 60.0 * points.len().saturating_sub(2) as f64
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

fn feasible(
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
        && shape
            .drawing
            .edges
            .iter()
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

fn ancestor(model: &Model<'_>, mut inner: usize, outer: usize) -> bool {
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

fn shared_junction(
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
    overlap
        && topology
            .fans
            .iter()
            .any(|fan| fan.members.contains(&index) && fan.members.contains(&other))
        && super::junctions::ordered(points, &line.points)
}

/// A higher departure uses the outer lane when both private labels leave downward.
fn label_escape(model: &Model<'_>, index: usize, shape: &Shape) -> f64 {
    let Some(label) = shape.labels.get(&index) else {
        return 0.0;
    };
    let (from, to) = model.ends[index];
    let source = shape.endpoints[&from];
    let target = shape.endpoints[&to];
    let left = label.x < source.x;
    let mut siblings: Vec<_> = shape
        .labels
        .iter()
        .filter(|(edge, at)| model.ends[**edge].0 == from && (at.x < source.x) == left)
        .collect();
    siblings.sort_by(|(a, one), (b, other)| one.y.total_cmp(&other.y).then(a.cmp(b)));
    let slot = siblings
        .iter()
        .position(|(edge, _)| **edge == index)
        .expect("the owned label");
    let outside = if center(target).y < center(source).y {
        slot
    } else {
        siblings.len() - 1 - slot
    };
    outside as f64 * crate::track::chains::LANE
}

/// Rounded corners must leave the complete arrow approach after painting.
fn approaches(points: &[Point]) -> bool {
    let required = APPROACH_STRAIGHT + if points.len() > 2 { BEND_RADIUS } else { 0.0 };
    length(&points[..2]) >= required && length(&points[points.len() - 2..]) >= required
}
