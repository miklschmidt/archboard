//! Flow decisions keep their declared bottom points and a separate incoming channel.

use super::{
    model::Model,
    ports::Port,
    shape::{CLEAR, Shape},
};
use crate::{
    geometry::{Point, Rect, Side},
    graph::{FROM_POINTS, POINTS_INSET},
};

pub(super) fn pointed(model: &Model<'_>, endpoint: usize) -> bool {
    model.outgoing[endpoint]
        .iter()
        .any(|&edge| model.edges[edge].option(FROM_POINTS).is_some())
}

/// The incoming channel stays outside the source's labels and above its card.
pub(super) fn prepare(model: &Model<'_>, endpoint: usize, shape: &mut Shape) {
    if !pointed(model, endpoint) {
        return;
    }
    let kinds: std::collections::BTreeSet<_> = model.incoming[endpoint]
        .iter()
        .map(|&edge| &model.treatments[edge])
        .collect();
    let inset = 2.0 * CLEAR + kinds.len() as f64 * 16.0;
    let old = shape.drawing.width * shape.drawing.height;
    shape.shift(Point { x: inset, y: inset });
    shape.drawing.width += inset + CLEAR;
    shape.drawing.height += inset + CLEAR;
    shape.empty += shape.drawing.width * shape.drawing.height - old;
    shape.cells.insert(
        endpoint,
        Rect {
            x: 0.0,
            y: 0.0,
            width: shape.drawing.width,
            height: shape.drawing.height,
        },
    );
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
            y: attachment.y + CLEAR,
        },
        offset: 0.0,
    })
}

pub(super) fn departure(model: &Model<'_>, edge: usize, shape: &Shape) -> Option<Vec<Point>> {
    let port = source_port(model, edge, shape)?;
    let Some(label) = shape.labels.get(&edge) else {
        return Some(vec![port.attachment, port.approach]);
    };
    let source = shape.endpoints[&model.ends[edge].0];
    let escape = super::channel::label_escape(model, edge, shape);
    let x = if label.x < source.x {
        label.x - CLEAR - escape
    } else {
        label.x + label.width + CLEAR + escape
    };
    let y = label.y + label.height / 2.0;
    Some(vec![
        port.attachment,
        Point {
            x: port.attachment.x,
            y,
        },
        Point { x, y },
    ])
}

pub(super) fn arrival(model: &Model<'_>, edge: usize, shape: &Shape) -> Option<Vec<Point>> {
    let target = model.ends[edge].1;
    if !pointed(model, target) {
        return None;
    }
    let cell = shape.cells[&target];
    let card = shape.endpoints[&target];
    let port = super::ports::port(
        model,
        edge,
        false,
        Side::Top,
        shape,
        super::ports::center(card),
    )?;
    let x = cell.x + 16.0 + port.offset;
    let y = cell.y + 16.0 + port.offset;
    Some(vec![
        Point {
            x,
            y: cell.y + cell.height,
        },
        Point { x, y },
        Point {
            x: port.attachment.x,
            y,
        },
        port.attachment,
    ])
}
