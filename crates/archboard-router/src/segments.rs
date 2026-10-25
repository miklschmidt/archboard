//! The segments of the routes and the space around them: the axis a pass
//! nudges along, each segment that runs along the other axis, the channel it
//! may move in, and the tests of whether two segments run beside each other
//! or a buffer stands between them.

use crate::Point;
use crate::grid::{Buffer, SAME, sign};

/// The axis a pass of nudging places segments along.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Axis {
    /// Segments that run down, placed along x.
    X,
    /// Segments that run across, placed along y.
    Y,
}

impl Axis {
    /// A point's position on this axis.
    pub(crate) fn of(self, p: Point) -> f64 {
        match self {
            Axis::X => p.x,
            Axis::Y => p.y,
        }
    }
    /// A point's position on the other axis, along the segments placed on this one.
    pub(crate) fn along(self, p: Point) -> f64 {
        match self {
            Axis::X => p.y,
            Axis::Y => p.x,
        }
    }
    /// Move a point to a position on this axis.
    pub(crate) fn set(self, p: &mut Point, value: f64) {
        match self {
            Axis::X => p.x = value,
            Axis::Y => p.y = value,
        }
    }
    /// A buffer's low and high sides across this axis, and along it.
    pub(crate) fn sides(self, b: &Buffer) -> (f64, f64, f64, f64) {
        match self {
            Axis::X => (b.left, b.right, b.top, b.bottom),
            Axis::Y => (b.top, b.bottom, b.left, b.right),
        }
    }
}

/// One segment that runs along the other axis, placed on this one.
#[derive(Clone, Copy)]
pub(crate) struct Segment {
    pub(crate) route: usize,
    pub(crate) index: usize,
    pub(crate) at: f64,
    pub(crate) low: f64,
    pub(crate) high: f64,
    pub(crate) fixed: bool,
    /// Whether the route turns the same way at both ends of the segment.
    pub(crate) zigzag: bool,
    /// Which way the route goes from each end, -1, 0 or 1 across this axis,
    /// summed over both ends.
    pub(crate) turns: i32,
}

/// Every segment of every route that runs along the other axis.
pub(crate) fn segments_of(routes: &[Option<Vec<Point>>], axis: Axis) -> Vec<Segment> {
    routes
        .iter()
        .enumerate()
        .filter_map(|(route, points)| Some((route, points.as_ref()?)))
        .flat_map(|(route, points)| {
            (0..points.len().saturating_sub(1))
                .filter_map(move |index| segment_of(points, route, index, axis))
        })
        .collect()
}

/// The segment of a route from one of its points to the next, if it runs
/// along the other axis.
pub(crate) fn segment_of(
    points: &[Point],
    route: usize,
    index: usize,
    axis: Axis,
) -> Option<Segment> {
    let (a, b) = (points[index], points[index + 1]);
    if (axis.of(a) - axis.of(b)).abs() > SAME || (axis.along(a) - axis.along(b)).abs() < SAME {
        return None;
    }
    let at = axis.of(a);
    let before = (index > 0).then(|| sign(at - axis.of(points[index - 1])));
    let after = points.get(index + 2).map(|p| sign(axis.of(*p) - at));
    let zigzag = matches!((before, after), (Some(x), Some(y)) if x == y && x != 0);
    // Which way the route goes at the low end and at the high end.
    let (low_end, high_end) = if axis.along(a) < axis.along(b) {
        (before.map(|s| -s), after)
    } else {
        (after, before.map(|s| -s))
    };
    Some(Segment {
        route,
        index,
        at,
        low: axis.along(a).min(axis.along(b)),
        high: axis.along(a).max(axis.along(b)),
        fixed: index == 0 || index == points.len().saturating_sub(2),
        zigzag,
        turns: low_end.unwrap_or(0) + high_end.unwrap_or(0),
    })
}

/// The free span across a segment's axis: between the nearest buffers on
/// either side that it runs beside.
pub(crate) fn channel_of(buffers: &[Buffer], axis: Axis, segment: &Segment) -> (f64, f64) {
    let (mut low, mut high) = (f64::NEG_INFINITY, f64::INFINITY);
    for buffer in buffers {
        let (near, far, from, to) = axis.sides(buffer);
        if !(segment.low < to - SAME && segment.high > from + SAME) {
            continue;
        }
        if far <= segment.at + SAME {
            low = low.max(far);
        } else if near >= segment.at - SAME {
            high = high.min(near);
        }
    }
    (low, high)
}

/// The stretch along the axis that two segments share, when they share more than a touch.
pub(crate) fn overlap(a: &Segment, b: &Segment) -> Option<(f64, f64)> {
    let (low, high) = (a.low.max(b.low), a.high.min(b.high));
    (high - low > SAME).then_some((low, high))
}

/// Whether a buffer stands between two positions over a span along the axis.
pub(crate) fn walled(buffers: &[Buffer], axis: Axis, from: f64, to: f64, span: (f64, f64)) -> bool {
    let (low, high) = (from.min(to), from.max(to));
    buffers.iter().any(|buffer| {
        let (near, far, start, end) = axis.sides(buffer);
        span.0 < end - SAME && span.1 > start + SAME && near >= low - SAME && far <= high + SAME
    })
}
