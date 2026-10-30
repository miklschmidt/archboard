//! How near a route's ink lies to other things, and whether a completed route
//! has the room its fixed bends and head need.

use archboard_scene::geometry::{
    Curve, EPSILON, Point, Rect, Segment, curve_bounds, segment_start, vertices_of,
};

use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::ecma::{hypot, min};

/// Halfway between two control points, for exact de Casteljau subdivision.
fn midpoint(a: Point, b: Point) -> Point {
    Point {
        x: f64::midpoint(a.x, b.x),
        y: f64::midpoint(a.y, b.y),
    }
}

/// Boxes that together enclose one segment: a cubic is split `depth` times, so
/// its boxes tell the curve from the empty space in its hull.
fn segment_boxes(from: Point, segment: &Segment, depth: u32, boxes: &mut Vec<Rect>) {
    let Segment::Cubic { first, second, to } = *segment else {
        boxes.push(curve_bounds(&Curve {
            from,
            segments: vec![*segment],
        }));
        return;
    };
    if depth == 0 {
        boxes.push(curve_bounds(&Curve {
            from,
            segments: vec![*segment],
        }));
        return;
    }
    let near = midpoint(from, first);
    let between = midpoint(first, second);
    let far = midpoint(second, to);
    let left = midpoint(near, between);
    let right = midpoint(between, far);
    let middle = midpoint(left, right);
    segment_boxes(
        from,
        &Segment::Cubic {
            first: near,
            second: left,
            to: middle,
        },
        depth - 1,
        boxes,
    );
    segment_boxes(
        middle,
        &Segment::Cubic {
            first: right,
            second: far,
            to,
        },
        depth - 1,
        boxes,
    );
}

/// Conservative bounds for small pieces of a curve, for the hop pass's checks
/// of what lies near.
pub(super) fn curve_boxes(curve: &Curve) -> Vec<Rect> {
    let mut boxes = Vec::new();
    for (index, segment) in curve.segments.iter().enumerate() {
        segment_boxes(segment_start(curve, index), segment, 4, &mut boxes);
    }
    boxes
}

/// Whether a completed route lacks the room its fixed geometry needs: a bend
/// not of the fixed radius, a straight run reversing through a bend, a leg too
/// short for its turns and head, or a label over a bend.
pub(super) fn lacks_clearance(curve: &Curve, label: Option<Rect>) -> bool {
    let points = vertices_of(curve);
    malformed_segment(curve)
        || short_leg(&points)
        || label.is_some_and(|label| label_on_bend(&points, label))
}

/// Whether a straight piece runs backward through an adjoining bend.
fn reverses_bend(curve: &Curve, index: usize) -> bool {
    let from = segment_start(curve, index);
    let to = curve.segments[index].to();
    let previous = index.checked_sub(1).and_then(|at| curve.segments.get(at));
    let next = curve.segments.get(index + 1);
    let mut tangents = Vec::new();
    if let Some(Segment::Cubic { second, .. }) = previous {
        tangents.push(Point {
            x: from.x - second.x,
            y: from.y - second.y,
        });
    }
    if let Some(Segment::Cubic { first, .. }) = next {
        tangents.push(Point {
            x: first.x - to.x,
            y: first.y - to.y,
        });
    }
    tangents
        .iter()
        .any(|tangent| (to.x - from.x) * tangent.x + (to.y - from.y) * tangent.y < -EPSILON)
}

/// Whether a bend lacks the fixed radius, or a straight run reverses through one.
fn malformed_segment(curve: &Curve) -> bool {
    curve
        .segments
        .iter()
        .enumerate()
        .any(|(index, segment)| match segment {
            Segment::Line { .. } => reverses_bend(curve, index),
            Segment::Cubic { to, .. } => {
                let from = segment_start(curve, index);
                ((to.x - from.x).abs() - BEND_RADIUS).abs() > EPSILON
                    || ((to.y - from.y).abs() - BEND_RADIUS).abs() > EPSILON
            }
        })
}

/// Whether an original leg lacks the room its turns and its arrowhead need.
fn short_leg(points: &[Point]) -> bool {
    (1..points.len()).any(|index| {
        let start = points[index - 1];
        let end = points[index];
        let required = (if index == 1 { 0.0 } else { BEND_RADIUS })
            + if index == points.len() - 1 {
                APPROACH_STRAIGHT
            } else {
                BEND_RADIUS
            };
        let available = hypot(end.x - start.x, end.y - start.y);
        available + EPSILON < required
    })
}

/// Whether a label covers any part of a bend.
fn label_on_bend(points: &[Point], label: Rect) -> bool {
    (1..points.len().saturating_sub(1)).any(|index| {
        let vertex = points[index];
        [points[index - 1], points[index + 1]]
            .into_iter()
            .any(|end| label_clearance(vertex, end, label) + EPSILON < BEND_RADIUS)
    })
}

/// How far a corner may round along one leg before it reaches a label:
/// infinity when the label does not meet the leg.
fn label_clearance(vertex: Point, end: Point, label: Rect) -> f64 {
    let inside = vertex.x >= label.x
        && vertex.x <= label.x + label.width
        && vertex.y >= label.y
        && vertex.y <= label.y + label.height;
    if inside {
        return 0.0;
    }
    // A leg down measures along y and is crossed in x; a leg across the other way.
    let vertical = end.x == vertex.x;
    let (cross_at, cross_low, breadth) = if vertical {
        (vertex.x, label.x, label.width)
    } else {
        (vertex.y, label.y, label.height)
    };
    if cross_at < cross_low || cross_at > cross_low + breadth {
        return f64::INFINITY;
    }
    let (low, extent) = if vertical {
        (label.y, label.height)
    } else {
        (label.x, label.width)
    };
    min([low, low + extent].into_iter().map(|at| {
        let point = if vertical {
            Point { x: vertex.x, y: at }
        } else {
            Point { x: at, y: vertex.y }
        };
        distance_on_leg(vertex, end, point).unwrap_or(f64::INFINITY)
    }))
}

/// A point's distance from a corner along one of its legs, when the point lies
/// on that leg.
fn distance_on_leg(vertex: Point, end: Point, point: Point) -> Option<f64> {
    let dx = end.x - vertex.x;
    let dy = end.y - vertex.y;
    let px = point.x - vertex.x;
    let py = point.y - vertex.y;
    if px * dy - py * dx != 0.0 {
        return None;
    }
    let projection = px * dx + py * dy;
    if projection < 0.0 || projection > dx * dx + dy * dy {
        return None;
    }
    Some(hypot(px, py))
}
