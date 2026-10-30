//! Flow decisions keep their declared bottom points and a separate incoming channel.

use super::{model::Model, ports::Port, shape::Shape};
use crate::{
    geometry::Point,
    graph::{FROM_POINTS, POINTS_INSET},
};

pub(super) fn pointed(model: &Model<'_>, endpoint: usize) -> bool {
    model.outgoing[endpoint]
        .iter()
        .any(|&edge| model.edges[edge].option(FROM_POINTS).is_some())
}

pub(super) fn source_port(model: &Model<'_>, edge: usize, shape: &Shape) -> Option<Port> {
    let one = model.edges[edge];
    let compass = one.option(FROM_POINTS)?;
    let at = shape.endpoints[&model.ends[edge].0];
    let inset: f64 = one.option(POINTS_INSET).unwrap_or("0").parse().ok()?;
    let x = at.x
        + match compass {
            "sw" => inset,
            "se" => at.width - inset,
            "s" => at.width / 2.0,
            _ => return None,
        };
    let attachment = Point {
        x,
        y: at.y + at.height + 0.02,
    };
    Some(Port {
        attachment,
        approach: Point {
            x,
            y: attachment.y
                + crate::constants::APPROACH_STRAIGHT
                + crate::constants::BEND_RADIUS
                + 0.02,
        },
    })
}

/// Provisional routes and shared fans cannot replace declared endpoint constraints.
/// The channel guard establishes the path's length and outward wall attachments first.
pub(super) fn follows(model: &Model<'_>, edge: usize, shape: &Shape, path: &[Point]) -> bool {
    let source_matches = model.edges[edge].option(FROM_POINTS).is_none()
        || source_port(model, edge, shape)
            .is_some_and(|port| super::geometry::length(&[path[0], port.attachment]) < 0.1);
    let to = model.ends[edge].1;
    let target = path[path.len() - 1];
    source_matches
        && (!pointed(model, to)
            || (target.y - shape.endpoints[&to].y).abs() < 0.1 && path[path.len() - 2].y < target.y)
}
