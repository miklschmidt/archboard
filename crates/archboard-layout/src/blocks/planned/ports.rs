//! Joint wall capacity and treatment-specific attachment order.

use super::model::Model;
use super::shape::{CLEAR, Shape};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;

#[derive(Clone, Copy, PartialEq)]
pub(super) struct Port {
    pub attachment: Point,
    pub approach: Point,
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
    let margin = if source { 12.0 } else { 20.0 };
    let point = distributed(at, index, kinds.len(), incidents.len(), toward, margin);
    let selected = on_wall(at, side, point, margin);
    if kinds.len() != 1 {
        return Some(selected);
    }
    separate_roles(model, endpoint, source, side, shape, selected)
}

fn separate_roles(
    model: &Model<'_>,
    endpoint: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    selected: Port,
) -> Option<Port> {
    let primary_source = matches!(side, Side::Bottom | Side::Right);
    let (others, own_margin) = if source {
        (&model.incoming[endpoint], 12.0)
    } else {
        (&model.outgoing[endpoint], 20.0)
    };
    if source == primary_source || others.is_empty() || kinds_of(model, others).len() != 1 {
        return Some(selected);
    }
    let other = others[0];
    let peer = if source {
        model.ends[other].0
    } else {
        model.ends[other].1
    };
    let toward = center(shape.endpoints[&peer]);
    let at = shape.endpoints[&endpoint];
    let margin = if primary_source { 12.0 } else { 20.0 };
    let primary = on_wall(
        at,
        side,
        distributed(at, 0, 1, others.len(), toward, margin),
        margin,
    );
    shifted_port(at, side, selected, primary, own_margin)
}
fn shifted_port(at: Rect, side: Side, selected: Port, primary: Port, margin: f64) -> Option<Port> {
    let vertical = matches!(side, Side::Top | Side::Bottom);
    let value = |p: Point| if vertical { p.x } else { p.y };
    let origin = value(primary.attachment);
    if (value(selected.attachment) - origin).abs() >= LANE {
        return Some(selected);
    }
    let (low, high) = if vertical {
        (at.x + margin, at.x + at.width - margin)
    } else {
        (at.y + margin, at.y + at.height - margin)
    };
    let position = [origin - LANE, origin + LANE]
        .into_iter()
        .filter(|&p| p >= low && p <= high)
        .min_by(|a, b| {
            (a - value(selected.attachment))
                .abs()
                .total_cmp(&(b - value(selected.attachment)).abs())
        })?;
    let toward = if vertical {
        Point {
            x: position,
            ..center(at)
        }
    } else {
        Point {
            y: position,
            ..center(at)
        }
    };
    Some(on_wall(at, side, toward, margin))
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

pub(super) fn center(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

pub(super) fn on_wall(at: Rect, side: Side, toward: Point, margin: f64) -> Port {
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
        attachment,
        approach: Point {
            x: attachment.x
                + by.x / CLEAR
                    * (crate::constants::APPROACH_STRAIGHT + crate::constants::BEND_RADIUS + 0.02),
            y: attachment.y
                + by.y / CLEAR
                    * (crate::constants::APPROACH_STRAIGHT + crate::constants::BEND_RADIUS + 0.02),
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
