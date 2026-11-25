//! A route measured along its ink, and shortened: the part of a line a pulse
//! rides.

use crate::geometry::{Curve, Point, Segment, segment_start};
use crate::js;

/// How many chords measure a rounded piece.
const CHORDS: u32 = 16;

/// How long one segment is along its ink.
pub(crate) fn segment_length(from: Point, segment: &Segment) -> f64 {
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

/// The point a fraction of the way along one segment.
pub(crate) fn point_on_segment(from: Point, segment: &Segment, t: f64) -> Point {
    match segment {
        Segment::Line { to } => Point {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
        },
        Segment::Cubic { first, second, to } => {
            let inverse = 1.0 - t;
            let weights = [
                crate::ecma::powi(inverse, 3),
                3.0 * crate::ecma::powi(inverse, 2) * t,
                3.0 * inverse * crate::ecma::powi(t, 2),
                crate::ecma::powi(t, 3),
            ];
            let points = [from, *first, *second, *to];
            let mut x = 0.0;
            let mut y = 0.0;
            for (point, weight) in points.iter().zip(weights) {
                x += point.x * weight;
            }
            for (point, weight) in points.iter().zip(weights) {
                y += point.y * weight;
            }
            Point { x, y }
        }
    }
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
pub(crate) fn shortened_by(curve: &Curve, distance: f64) -> Option<Curve> {
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
pub(crate) fn route_length(curve: &Curve) -> f64 {
    curve
        .segments
        .iter()
        .enumerate()
        .fold(0.0, |length, (index, segment)| {
            length + segment_length(segment_start(curve, index), segment)
        })
}

/// A route laid flat into short chords: its points, and how far along its ink
/// each one lies, to find where a route stands some way along it.
#[derive(Clone, Debug)]
pub(crate) struct Walk {
    points: Vec<Point>,
    at: Vec<f64>,
}

/// Where a walk stands at some distance along its route: the point, and the
/// way the route runs there as a vector of length one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Stand {
    pub(crate) point: Point,
    pub(crate) way: Point,
}

impl Stand {
    /// A point given across the stand's way: `along` its way and `aside` to its left.
    pub(crate) fn turned(&self, along: f64, aside: f64) -> Point {
        Point {
            x: self.point.x + self.way.x * along - self.way.y * aside,
            y: self.point.y + self.way.y * along + self.way.x * aside,
        }
    }
}

impl Walk {
    /// A route laid flat.
    pub(crate) fn of(curve: &Curve) -> Walk {
        let mut points = vec![curve.from];
        for (index, segment) in curve.segments.iter().enumerate() {
            let from = segment_start(curve, index);
            match segment {
                Segment::Line { to } => points.push(*to),
                Segment::Cubic { .. } => points.extend((1..=CHORDS).map(|step| {
                    point_on_segment(from, segment, f64::from(step) / f64::from(CHORDS))
                })),
            }
        }
        points.dedup();
        let mut at = vec![0.0];
        for pair in points.windows(2) {
            let run = js::hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
            at.push(at.last().copied().unwrap_or(0.0) + run);
        }
        Walk { points, at }
    }

    /// How long the route is along its ink.
    pub(crate) fn length(&self) -> f64 {
        self.at.last().copied().unwrap_or(0.0)
    }

    /// Where the walk stands a distance along the route, held to its ends.
    pub(crate) fn stand(&self, distance: f64) -> Stand {
        let last = self.points.len().saturating_sub(1);
        let chord = self
            .at
            .iter()
            .skip(1)
            .position(|reach| *reach >= distance)
            .unwrap_or_else(|| last.saturating_sub(1));
        let (from, to) = (self.points[chord], self.points[(chord + 1).min(last)]);
        let run = self.at.get(chord + 1).copied().unwrap_or(0.0) - self.at[chord];
        let t = if run > 0.0 {
            ((distance - self.at[chord]) / run).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let way = if run > 0.0 {
            Point {
                x: (to.x - from.x) / run,
                y: (to.y - from.y) / run,
            }
        } else {
            Point { x: 1.0, y: 0.0 }
        };
        Stand {
            point: Point {
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t,
            },
            way,
        }
    }
}
