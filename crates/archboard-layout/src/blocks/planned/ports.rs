//! Joint wall capacity and treatment-specific attachment order.

use super::model::Model;
use super::shape::{CLEAR, Shape};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::route::trunk_kind;

#[derive(Clone, Copy)]
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
    let endpoint = if source {
        model.ends[edge].0
    } else {
        model.ends[edge].1
    };
    let at = shape.endpoints[&endpoint];
    let incidents: Vec<_> = model
        .ends
        .iter()
        .enumerate()
        .filter(|(_, ends)| {
            if source {
                ends.0 == endpoint
            } else {
                ends.1 == endpoint
            }
        })
        .map(|(index, _)| index)
        .collect();
    let kinds = kinds_of(model, &incidents);
    if !room(at, side, kinds.len()) {
        return None;
    }
    let point = if kinds.len() > 1 {
        let index = kinds
            .iter()
            .position(|kind| *kind == trunk_kind(model.edges[edge]))?;
        let fraction = (index + 1) as f64 / (kinds.len() + 1) as f64;
        Point {
            x: at.x + at.width * fraction,
            y: at.y + at.height * fraction,
        }
    } else if incidents.len() > 1 {
        center(at)
    } else {
        toward
    };
    Some(on_wall(at, side, point))
}

pub(super) fn center(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

fn on_wall(at: Rect, side: Side, toward: Point) -> Port {
    let x = toward.x.clamp(
        at.x + at.width.min(40.0) / 2.0,
        at.x + at.width - at.width.min(40.0) / 2.0,
    );
    let y = toward.y.clamp(
        at.y + at.height.min(40.0) / 2.0,
        at.y + at.height - at.height.min(40.0) / 2.0,
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
    Port {
        attachment,
        approach: Point {
            x: attachment.x + by.x,
            y: attachment.y + by.y,
        },
    }
}

fn kinds_of(model: &Model<'_>, incidents: &[usize]) -> Vec<String> {
    let mut kinds = Vec::new();
    for &index in incidents {
        let kind = trunk_kind(model.edges[index]);
        if !kinds.contains(&kind) {
            kinds.push(kind);
        }
    }
    kinds
}

fn room(at: Rect, side: Side, count: usize) -> bool {
    let span = if matches!(side, Side::Top | Side::Bottom) {
        at.width
    } else {
        at.height
    };
    count <= 1 || (span - 40.0) / ((count - 1) as f64) >= LANE
}
