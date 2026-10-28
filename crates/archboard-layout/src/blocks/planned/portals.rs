//! A frame crossing follows the planned ancestry once, through a free wall.

use super::geometry::length;
use super::shape::Shape;
use super::topology::Route;
use crate::geometry::{Point, Rect, Side};

struct Crossing {
    distance: f64,
    scope: usize,
    outward: bool,
}

/// Every crossing is a portal in the declared source-to-target scope chain.
pub(super) fn follows(route: &Route, shape: &Shape, path: &[Point]) -> bool {
    let expected: Vec<_> = route
        .outward
        .iter()
        .map(|&scope| (scope, true))
        .chain(route.inward.iter().map(|&scope| (scope, false)))
        .collect();
    let mut crossings = Vec::new();
    for &(scope, _) in &expected {
        let Some(found) = in_frame(path, shape.scopes[&scope], scope) else {
            return false;
        };
        crossings.extend(found);
    }
    crossings.sort_by(|a, b| {
        a.distance
            .total_cmp(&b.distance)
            .then(a.scope.cmp(&b.scope))
    });
    crossings
        .into_iter()
        .map(|c| (c.scope, c.outward))
        .collect::<Vec<_>>()
        == expected
}

fn in_frame(path: &[Point], bounds: Rect, scope: usize) -> Option<Vec<Crossing>> {
    let mut crossings = Vec::new();
    let mut before = 0.0;
    if path.windows(2).any(|segment| along_wall(segment, bounds)) {
        return None;
    }
    for segment in path.windows(2) {
        for side in [Side::Top, Side::Right, Side::Bottom, Side::Left] {
            if let Some((distance, outward)) = crossing(segment, bounds, side).ok()? {
                crossings.push(Crossing {
                    distance: before + distance,
                    scope,
                    outward,
                });
            }
        }
        before += length(segment);
    }
    Some(crossings)
}

fn along_wall(segment: &[Point], bounds: Rect) -> bool {
    let (a, b) = (segment[0], segment[1]);
    (a.x == b.x
        && (a.x == bounds.x || a.x == bounds.x + bounds.width)
        && a.y.min(b.y) < bounds.y + bounds.height
        && a.y.max(b.y) > bounds.y)
        || (a.y == b.y
            && (a.y == bounds.y || a.y == bounds.y + bounds.height)
            && a.x.min(b.x) < bounds.x + bounds.width
            && a.x.max(b.x) > bounds.x)
}

fn crossing(segment: &[Point], bounds: Rect, side: Side) -> Result<Option<(f64, bool)>, ()> {
    let (a, b) = (segment[0], segment[1]);
    let horizontal_wall = matches!(side, Side::Top | Side::Bottom);
    let vertical_line = a.x == b.x;
    if horizontal_wall != vertical_line {
        return Ok(None);
    }
    let (start, end, along, wall, low, span) = match side {
        Side::Top => (a.y, b.y, a.x, bounds.y, bounds.x, bounds.width),
        Side::Bottom => (
            a.y,
            b.y,
            a.x,
            bounds.y + bounds.height,
            bounds.x,
            bounds.width,
        ),
        Side::Left => (a.x, b.x, a.y, bounds.x, bounds.y, bounds.height),
        Side::Right => (
            a.x,
            b.x,
            a.y,
            bounds.x + bounds.width,
            bounds.y,
            bounds.height,
        ),
    };
    if wall <= start.min(end) || wall >= start.max(end) || along < low || along > low + span {
        return Ok(None);
    }
    if along - low < 16.0 || along - low > span - 16.0 {
        return Err(());
    }
    let outward = if matches!(side, Side::Top | Side::Left) {
        end < start
    } else {
        end > start
    };
    Ok(Some(((wall - start).abs(), outward)))
}
