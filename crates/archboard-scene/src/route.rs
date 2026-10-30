//! A route measured along its ink, and shortened: the part of a line a pulse
//! rides.

use crate::geometry::{Curve, Point, Segment, point_on_segment, segment_start};
use crate::js;

/// How many chords measure a rounded piece.
const CHORDS: u32 = 16;

/// How long one segment is along its ink.
pub fn segment_length(from: Point, segment: &Segment) -> f64 {
    if let Segment::Line { to } = segment {
        return js::hypot(to.x - from.x, to.y - from.y);
    }
    let mut length = 0.0;
    let mut previous = from;
    for step in 1..=CHORDS {
        let point = point_on_segment(from, segment, f64::from(step) / f64::from(CHORDS));
        length += js::hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
    }
    length
}

/// The point a fraction of the way from one point to another.
fn lerp(a: Point, b: Point, t: f64) -> Point {
    Point {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
    }
}

/// The first part of one segment, up to a fraction of it.
fn segment_up_to(from: Point, segment: &Segment, t: f64) -> Segment {
    let to = point_on_segment(from, segment, t);
    match segment {
        Segment::Line { .. } => Segment::Line { to },
        Segment::Cubic { first, second, .. } => {
            let one = lerp(from, *first, t);
            let two = lerp(one, lerp(*first, *second, t), t);
            Segment::Cubic {
                first: one,
                second: two,
                to,
            }
        }
    }
}

/// The route with a length taken off its end, or none when that is all of it.
pub fn shortened_by(curve: &Curve, distance: f64) -> Option<Curve> {
    let mut left = distance;
    for index in (0..curve.segments.len()).rev() {
        let from = segment_start(curve, index);
        let segment = &curve.segments[index];
        let length = segment_length(from, segment);
        if length > left {
            let kept = segment_up_to(from, segment, 1.0 - left / length);
            let mut segments = curve.segments[..index].to_vec();
            segments.push(kept);
            return Some(Curve {
                from: curve.from,
                segments,
            });
        }
        left -= length;
    }
    None
}

/// How long a route is along its ink.
pub fn route_length(curve: &Curve) -> f64 {
    curve
        .segments
        .iter()
        .enumerate()
        .fold(0.0, |length, (index, segment)| {
            length + segment_length(segment_start(curve, index), segment)
        })
}
