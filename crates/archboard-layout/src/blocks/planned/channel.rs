//! Peer-facing wall candidates and local channel templates. No grid search.

use crate::blocks::assembly::PlacedLine;
use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::geometry::{Point, Rect, inflate};

use super::geometry::{contains, crosses_box, intersection, length};
use super::model::Model;
use super::ports::{center, port};
use super::shape::Shape;
use super::topology::Topology;

pub(super) fn feasible(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    points: &[Point],
    bounds: Rect,
) -> bool {
    refusal(model, topology, index, shape, points, bounds).is_none()
}

pub(super) fn refusal(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    shape: &Shape,
    points: &[Point],
    bounds: Rect,
) -> Option<&'static str> {
    let (from, to) = model.ends[index];
    if let Some(reason) = basic(points, shape.endpoints[&from], shape.endpoints[&to], bounds) {
        return Some(reason);
    }
    if shape
        .labels
        .get(&index)
        .is_some_and(|&label| !label_run(points, label))
    {
        return Some("label run");
    }
    if shape.endpoints.iter().any(|(&id, &r)| {
        crosses_box(
            points,
            if id == from || id == to {
                r
            } else {
                inflate(r, 16.0)
            },
        )
    }) {
        return Some("card");
    }
    if shape
        .labels
        .iter()
        .any(|(&id, &r)| id != index && crosses_box(points, inflate(r, 12.01)))
    {
        return Some("label");
    }
    if shape
        .drawing
        .regions
        .iter()
        .any(|r| crosses_box(points, inflate(r.caption, 16.0)))
    {
        return Some("caption");
    }
    if hugs_wall(shape, points) {
        return Some("wall lane");
    }
    if !outside_foreign_scopes(model, topology, index, shape, points) {
        return Some("foreign scope");
    }
    if !super::portals::follows(&topology.routes[index], shape, points) {
        return Some("portal");
    }
    if !shape
        .routes
        .iter()
        .filter(|line| line.id != model.edges[index].id)
        .all(|line| shared_junction(model, topology, index, points, line))
    {
        return Some("junction");
    }
    None
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
        (pair[0].y - y).abs() < 1e-6
            && (pair[1].y - y).abs() < 1e-6
            && pair[0].x.min(pair[1].x) <= label.x - 16.0
            && pair[0].x.max(pair[1].x) >= label.x + label.width + 16.0
            || (pair[0].x - label.x - label.width / 2.0).abs() < 1e-6
                && (pair[1].x - label.x - label.width / 2.0).abs() < 1e-6
                && pair[0].y.min(pair[1].y) <= label.y - 16.0
                && pair[0].y.max(pair[1].y) >= label.y + label.height + 16.0
    })
}

pub(super) fn shared_junction(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    let Some(&other) = model.edge_index.get(line.id.as_str()) else {
        return false;
    };
    let shared = topology.memberships[index]
        .iter()
        .flatten()
        .any(|fan| topology.memberships[other].contains(&Some(*fan)));
    (!shared
        || super::junctions::sharing(
            points,
            &line.points,
            model.ends[index].0 == model.ends[other].0,
            model.ends[index].1 == model.ends[other].1,
        ))
        && super::junctions::ordered(points, &line.points, shared)
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
    let Some(&other) = model.edge_index.get(line.id.as_str()) else {
        return false;
    };
    model.treatments[edge] == model.treatments[other]
        && (model.ends[edge].0 == model.ends[other].0 || model.ends[edge].1 == model.ends[other].1)
}

/// Rounded corners must leave the complete arrow approach after painting.
pub(super) fn approaches(points: &[Point]) -> bool {
    let required = APPROACH_STRAIGHT + if points.len() > 2 { BEND_RADIUS } else { 0.0 };
    length(&points[..2]) >= required && length(&points[points.len() - 2..]) >= required
}

/// Source approaches depend on the endpoint geometry and declared flow points.
pub(super) fn tails(model: &Model<'_>, index: usize, shape: &Shape) -> Vec<Vec<Point>> {
    let target = center(shape.endpoints[&model.ends[index].1]);
    model.endpoints[model.ends[index].0]
        .walls
        .into_iter()
        .filter_map(|side| port(model, index, true, side, shape, target))
        .map(|port| vec![port.attachment, port.approach])
        .collect()
}

pub(super) fn attached(at: Point, next: Point, bounds: Rect) -> bool {
    let near = |a: f64, b: f64| (a - b).abs() < 0.1;
    if at.x == next.x {
        at.x >= bounds.x
            && at.x <= bounds.x + bounds.width
            && (near(at.y, bounds.y) && next.y < at.y
                || near(at.y, bounds.y + bounds.height) && next.y > at.y)
    } else if at.y == next.y {
        at.y >= bounds.y
            && at.y <= bounds.y + bounds.height
            && (near(at.x, bounds.x) && next.x < at.x
                || near(at.x, bounds.x + bounds.width) && next.x > at.x)
    } else {
        false
    }
}

fn hugs_wall(shape: &Shape, points: &[Point]) -> bool {
    shape
        .scopes
        .iter()
        .filter(|(id, _)| **id != 0)
        .any(|(_, scope)| {
            let r = scope.bounds;
            points.windows(2).any(|p| {
                let vertical = p[0].x == p[1].x;
                let (at, lo, hi, start, end, walls) = if vertical {
                    (
                        p[0].x,
                        p[0].y.min(p[1].y),
                        p[0].y.max(p[1].y),
                        r.y,
                        r.y + r.height,
                        [r.x, r.x + r.width],
                    )
                } else {
                    (
                        p[0].y,
                        p[0].x.min(p[1].x),
                        p[0].x.max(p[1].x),
                        r.x,
                        r.x + r.width,
                        [r.y, r.y + r.height],
                    )
                };
                hi.min(end) - lo.max(start) > 16.0
                    && walls.iter().any(|wall| (at - wall).abs() < 16.0 - 1e-6)
            })
        })
}

fn basic(points: &[Point], source: Rect, target: Rect, bounds: Rect) -> Option<&'static str> {
    if points
        .windows(2)
        .any(|p| p[0].x != p[1].x && p[0].y != p[1].y)
    {
        return Some("slanted");
    }
    if points.len() < 2 || !approaches(points) {
        return Some("approach");
    }
    if !attached(points[0], points[1], source)
        || !attached(points[points.len() - 1], points[points.len() - 2], target)
    {
        return Some("attachment wall");
    }
    if !points.iter().all(|point| {
        contains(
            bounds,
            Rect {
                x: point.x,
                y: point.y,
                width: 0.0,
                height: 0.0,
            },
        )
    }) {
        return Some("bounds");
    }
    None
}
