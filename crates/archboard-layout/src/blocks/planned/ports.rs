//! Joint wall capacity and treatment-specific attachment order.

use super::model::Model;
use super::shape::{CLEAR, Shape};
use crate::geometry::{Point, Rect, Side};
use crate::graph::DOOR;
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
    if !model.endpoints[endpoint].walls.contains(&side) {
        return None;
    }
    let at = shape.wall(endpoint, side);
    let kinds = kinds_of(model, incidents);
    let door = model.endpoints[endpoint].node.option(DOOR).is_some();
    // A door cannot widen for its incoming fan. Keep its ports inside the rounded corners
    // with the twelve-point line gap that the geometry guard requires.
    let (margin, spacing) = match (source, door) {
        (true, _) => (12.0, 8.0),
        (false, true) => (12.0, 12.0),
        (false, false) => (20.0, LANE),
    };
    if !room(at, side, kinds.len(), margin, spacing) {
        return None;
    }
    let index = kinds
        .iter()
        .position(|kind| *kind == model.treatments[edge])?;
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
    let at = shape.wall(endpoint, side);
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

/// Whether a line meets each door it joins on a side that faces the line's far end. A line
/// that met a door on another side would loop round the door, or reach it from behind.
pub(super) fn faces_far_end(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
) -> bool {
    let (from, to) = model.ends[edge];
    let last = points.len() - 1;
    [
        (from, to, points[0], points[1]),
        (to, from, points[last], points[last - 1]),
    ]
    .into_iter()
    .all(|(at, far, attachment, next)| {
        model.endpoints[at].node.option(DOOR).is_none()
            || facing(
                shape.endpoints[&at],
                center(shape.endpoints[&far]),
                attachment,
                next,
            )
    })
}

/// Whether a line that leaves a box from one point toward the next heads for a far point.
/// A far point beside the box in neither direction leaves every side open.
fn facing(at: Rect, far: Point, attachment: Point, next: Point) -> bool {
    let above = far.y < at.y;
    let below = far.y > at.y + at.height;
    let before = far.x < at.x;
    let after = far.x > at.x + at.width;
    if !(above || below || before || after) {
        return true;
    }
    if next.y < attachment.y {
        above
    } else if next.y > attachment.y {
        below
    } else if next.x < attachment.x {
        before
    } else {
        after
    }
}

pub(super) fn center(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

/// A place along a wall, a margin in from each end. On a wall shorter than twice
/// the margin both ends meet at its middle, and rounding must not cross them.
fn along(value: f64, start: f64, length: f64, margin: f64) -> f64 {
    let inset = length.min(2.0 * margin) / 2.0;
    let low = start + inset;
    value.clamp(low, (start + length - inset).max(low))
}

pub(super) fn on_wall(at: Rect, side: Side, toward: Point, margin: f64) -> Port {
    let x = along(toward.x, at.x, at.width, margin);
    let y = along(toward.y, at.y, at.height, margin);
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

fn room(at: Rect, side: Side, count: usize, margin: f64, spacing: f64) -> bool {
    let span = if matches!(side, Side::Top | Side::Bottom) {
        at.width
    } else {
        at.height
    };
    count <= 1 || (span - 2.0 * margin) / ((count - 1) as f64) >= spacing
}

#[cfg(test)]
mod tests {
    use super::along;

    #[test]
    fn a_wall_shorter_than_its_margins_holds_a_place_at_its_middle() {
        // Rounding once stood the two ends of this wall the wrong way round, and `clamp` panics then.
        let (start, length) = (0.1, 0.1 + 0.2);
        assert!((along(50.0, start, length, 8.0) - (start + length / 2.0)).abs() < 1e-9);
        assert_eq!(along(50.0, 0.0, 100.0, 8.0), 50.0);
        assert_eq!(along(99.0, 0.0, 100.0, 8.0), 92.0);
    }
}
