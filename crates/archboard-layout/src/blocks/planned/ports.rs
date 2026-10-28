//! Joint wall capacity and treatment-specific attachment order.

use super::model::Model;
use super::shape::{CLEAR, Shape};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;

#[derive(Clone, Copy)]
pub(super) struct Port {
    pub attachment: Point,
    pub approach: Point,
    pub offset: f64,
}

/// Reserve future source departures before an incoming route can occupy their stems.
pub(super) fn reserve(
    model: &Model<'_>,
    shape: &Shape,
) -> std::collections::BTreeMap<usize, Vec<Point>> {
    shape
        .labels
        .iter()
        .filter_map(|(&edge, &label)| {
            super::points::departure(model, edge, shape)
                .or_else(|| label_stem(model, edge, shape, label))
                .map(|points| (edge, points))
        })
        .collect()
}

fn label_stem(model: &Model<'_>, edge: usize, shape: &Shape, label: Rect) -> Option<Vec<Point>> {
    let source = shape.endpoints[&model.ends[edge].0];
    let side = if label.x < source.x {
        Side::Left
    } else {
        Side::Right
    };
    let port = port(model, edge, true, side, shape, center(label))?;
    let siblings = shape
        .labels
        .iter()
        .filter(|(other, at)| {
            model.ends[**other].0 == model.ends[edge].0 && (at.x < source.x) == (label.x < source.x)
        })
        .count();
    let escape = super::channel::label_escape(model, edge, shape);
    let mut points = super::channel::departures(source, side, Some(label), port, escape)
        .into_iter()
        .next()?;
    if siblings > 1 {
        let cell = shape.cells[&model.ends[edge].0];
        points.push(Point {
            x: points.last()?.x,
            y: cell.y + cell.height + 16.0,
        });
    }
    Some(super::geometry::clean(points))
}

pub(super) fn reserved(model: &Model<'_>, edge: usize, shape: &Shape, points: &[Point]) -> bool {
    reservations(model, edge, shape, points, true)
}

pub(super) fn reserved_fragment(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    points: &[Point],
) -> bool {
    reservations(model, edge, shape, points, false)
}

fn reservations(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    points: &[Point],
    complete: bool,
) -> bool {
    shape.stems.iter().all(|(&other, stem)| {
        if other == edge {
            return true;
        }
        let (overlap, crossing) = super::geometry::intersection(points, stem);
        if !overlap && !crossing {
            return true;
        }
        let common = model.ends[edge].0 == model.ends[other].0
            && model.treatments[edge] == model.treatments[other];
        if overlap && !common {
            return false;
        }
        if !complete {
            return true;
        }
        let mut continued = stem.clone();
        let last = continued.len() - 1;
        let (a, b) = (continued[last - 1], continued[last]);
        if a.x == b.x {
            continued[last].y += CLEAR * (b.y - a.y).signum();
        } else {
            continued[last].x += CLEAR * (b.x - a.x).signum();
        }
        super::junctions::ordered(points, &continued)
    })
}

/// One treatment shares a port only in one direction at one endpoint.
pub(super) fn port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    toward: Point,
) -> Option<Port> {
    if source
        && model.edges[edge]
            .option(crate::graph::FROM_POINTS)
            .is_some()
    {
        return (side == Side::Bottom)
            .then(|| super::points::source_port(model, edge, shape))
            .flatten();
    }
    choose_port(model, edge, source, side, shape, toward)
}

fn choose_port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    toward: Point,
) -> Option<Port> {
    let (endpoint, incidents) = if source {
        let endpoint = model.ends[edge].0;
        (endpoint, &model.outgoing[endpoint])
    } else {
        let endpoint = model.ends[edge].1;
        (endpoint, &model.incoming[endpoint])
    };
    if !source && super::points::pointed(model, endpoint) && side != Side::Top {
        return None;
    }
    let at = shape.endpoints[&endpoint];
    let kinds = kinds_of(model, incidents);
    if !room(at, side, kinds.len(), source) {
        return None;
    }
    let index = kinds
        .iter()
        .position(|kind| *kind == model.treatments[edge])?;
    let aligned = source && aligned_labels(model, edge, endpoint, side, shape, at);
    let margin = if source { 12.0 } else { 20.0 };
    let point = if aligned {
        toward
    } else {
        distributed(at, index, kinds.len(), incidents.len(), toward, margin)
    };
    let mut port = on_wall(at, side, point, margin);
    port.offset = index as f64 * LANE;
    Some(port)
}

fn distributed(
    at: Rect,
    index: usize,
    kinds: usize,
    incidents: usize,
    toward: Point,
    margin: f64,
) -> Point {
    if kinds > 1 {
        fraction_of(at, index, kinds, margin)
    } else if incidents > 1 {
        center(at)
    } else {
        toward
    }
}

fn fraction_of(at: Rect, index: usize, count: usize, margin: f64) -> Point {
    let fraction = index as f64 / (count - 1) as f64;
    Point {
        x: at.x + margin + (at.width - 2.0 * margin) * fraction,
        y: at.y + margin + (at.height - 2.0 * margin) * fraction,
    }
}

fn aligned_labels(
    model: &Model<'_>,
    edge: usize,
    endpoint: usize,
    side: Side,
    shape: &Shape,
    at: Rect,
) -> bool {
    model.edges[edge].label().is_some()
        && matches!(side, Side::Left | Side::Right)
        && shape
            .labels
            .iter()
            .filter(|(other, label)| {
                model.ends[**other].0 == endpoint && (label.x < at.x) == matches!(side, Side::Left)
            })
            .all(|(_, label)| {
                let y = center(*label).y;
                y >= at.y + 12.0 && y <= at.y + at.height - 12.0
            })
}

pub(super) fn source_gap(model: &Model<'_>, endpoint: usize) -> f64 {
    let incidents = &model.outgoing[endpoint];
    if incidents.len() == 1
        && model.scopes[model.endpoints[endpoint].scope].header != Some(endpoint)
    {
        return CLEAR;
    }
    2.0 * CLEAR + kinds_of(model, incidents).len().saturating_sub(1) as f64 * LANE
}

pub(super) fn center(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

fn on_wall(at: Rect, side: Side, toward: Point, margin: f64) -> Port {
    let x = toward.x.clamp(
        at.x + at.width.min(2.0 * margin) / 2.0,
        at.x + at.width - at.width.min(2.0 * margin) / 2.0,
    );
    let y = toward.y.clamp(
        at.y + at.height.min(2.0 * margin) / 2.0,
        at.y + at.height - at.height.min(2.0 * margin) / 2.0,
    );
    let (attachment, by) = match side {
        Side::Top => (Point { x, y: at.y }, Point { x: 0.0, y: -CLEAR }),
        Side::Right => (
            Point {
                x: at.x + at.width,
                y,
            },
            Point { x: CLEAR, y: 0.0 },
        ),
        Side::Bottom => (
            Point {
                x,
                y: at.y + at.height,
            },
            Point { x: 0.0, y: CLEAR },
        ),
        Side::Left => (Point { x: at.x, y }, Point { x: -CLEAR, y: 0.0 }),
    };
    // SVG coordinates round to hundredths. Keep the contact just outside the
    // painted face so independent rounding cannot turn it into a header strike.
    let attachment = Point {
        x: attachment.x + by.x / CLEAR * 0.02,
        y: attachment.y + by.y / CLEAR * 0.02,
    };
    Port {
        offset: 0.0,
        attachment,
        approach: Point {
            x: attachment.x + by.x,
            y: attachment.y + by.y,
        },
    }
}

fn kinds_of<'a>(model: &'a Model<'_>, incidents: &[usize]) -> Vec<&'a str> {
    let mut kinds = Vec::new();
    for &index in incidents {
        let kind = model.treatments[index].as_str();
        if !kinds.contains(&kind) {
            kinds.push(kind);
        }
    }
    kinds
}

fn room(at: Rect, side: Side, count: usize, source: bool) -> bool {
    let span = if matches!(side, Side::Top | Side::Bottom) {
        at.width
    } else {
        at.height
    };
    let (margin, spacing) = if source { (12.0, 8.0) } else { (20.0, LANE) };
    count <= 1 || (span - 2.0 * margin) / ((count - 1) as f64) >= spacing
}

pub(super) fn source_kinds<'a>(model: &'a Model<'_>, endpoint: usize) -> Vec<&'a str> {
    kinds_of(model, &model.outgoing[endpoint])
}

pub(super) fn source_paths(
    model: &Model<'_>,
    index: usize,
    shape: &Shape,
) -> Option<std::collections::BTreeMap<usize, Vec<Point>>> {
    let card = shape.endpoints[&index];
    let mut tails = std::collections::BTreeMap::new();
    let stems = reserve(model, shape);
    for &edge in &model.outgoing[index] {
        let mut path = if let Some(stem) = stems
            .get(&edge)
            .cloned()
            .or_else(|| super::points::departure(model, edge, shape))
        {
            stem
        } else {
            let port = port(model, edge, true, Side::Right, shape, center(card))?;
            let x =
                card.x + card.width + (source_gap(model, index) - CLEAR - port.offset).max(CLEAR);
            vec![
                port.attachment,
                Point {
                    x,
                    y: port.attachment.y,
                },
            ]
        };
        path.push(Point {
            x: path.last().expect("a departure").x,
            y: shape.drawing.height,
        });
        tails.insert(edge, super::geometry::clean(path));
    }
    Some(tails)
}

/// A compact cell is accepted only when all its source prefixes coexist.
/// Continue the boundary ends so they are not mistaken for final bends.
pub(super) fn safe_sources(model: &Model<'_>, endpoint: usize, shape: &Shape) -> bool {
    source_paths(model, endpoint, shape).is_some_and(|mut paths| {
        for path in paths.values_mut() {
            if let Some(last) = path.last_mut() {
                last.y += CLEAR;
            }
        }
        paths.iter().all(|(&edge, path)| {
            !super::geometry::crosses_box(path, shape.endpoints[&endpoint])
                && shape.labels.iter().all(|(&other, &label)| {
                    other == edge
                        || !super::geometry::crosses_box(
                            path,
                            crate::geometry::inflate(label, 12.0),
                        )
                })
                && paths.iter().all(|(&other, next)| {
                    edge >= other
                        || ((model.treatments[edge] == model.treatments[other]
                            || !super::geometry::intersection(path, next).0)
                            && super::junctions::ordered(path, next))
                })
        })
    })
}
