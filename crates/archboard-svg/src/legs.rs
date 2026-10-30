//! A route cut into the pieces a beam of light is drawn on: each a straight
//! run or one bend, with a frame of its own to draw in.

use archboard_scene::geometry::{Curve, Point, Segment, round_coord, segment_start};
use archboard_scene::js;
use archboard_scene::route::segment_length;
use archboard_scene::scene::PathStep;

use crate::path::{Spelling, path_data};
use crate::xml::coord;

/// The shortest piece of a route worth a beam of its own.
const LEAST_PIECE: f64 = 0.5;
/// How far the narrow, bright layers of a piece's mask run into the next piece.
const OVERLAP: f64 = 0.5;

/// One piece of a route, with the frame its beam is drawn in.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Leg {
    pub from: Point,
    pub segment: Segment,
    /// How far along the route the piece starts.
    pub along: f64,
    /// How long the piece is along its ink.
    pub length: f64,
    /// The transform that puts the frame's x axis along the piece.
    pub frame: String,
    /// How far the piece strays from the straight line between its ends.
    pub sag: f64,
}

/// The unit direction from one point to another, or none when they are one.
fn direction_of(from: Point, to: Point) -> Option<Point> {
    let length = js::hypot(to.x - from.x, to.y - from.y);
    if length < 1e-9 {
        return None;
    }
    Some(Point {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
    })
}

/// How far a segment's own control points stray from the line between its ends.
fn sag_of(from: Point, segment: &Segment) -> f64 {
    let Segment::Cubic { first, second, to } = segment else {
        return 0.0;
    };
    let chord = js::hypot(to.x - from.x, to.y - from.y);
    js::max([*first, *second].map(|point| {
        (((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) / chord)
            .abs()
    }))
}

/// The frame one piece of a route is drawn in.
fn frame_of(from: Point, to: Point, length: f64) -> String {
    let angle = (libm::atan2(to.y - from.y, to.x - from.x) * 180.0) / std::f64::consts::PI;
    let stretch = js::hypot(to.x - from.x, to.y - from.y) / length;
    let scaled = if (stretch - 1.0).abs() < 1e-4 {
        String::new()
    } else {
        format!(" scale({} 1)", js::fixed_number(stretch, 5))
    };
    format!(
        "translate({} {}) rotate({}){scaled}",
        coord(from.x),
        coord(from.y),
        js::fixed_number(angle, 3)
    )
}

/// A route cut into the pieces a beam is drawn on.
pub(crate) fn legs_of(curve: &Curve) -> Vec<Leg> {
    let mut legs = Vec::new();
    let mut along = 0.0;
    for (index, segment) in curve.segments.iter().enumerate() {
        let from = segment_start(curve, index);
        let length = segment_length(from, segment);
        if length >= LEAST_PIECE && direction_of(from, segment.to()).is_some() {
            legs.push(Leg {
                from,
                segment: *segment,
                along,
                length,
                frame: frame_of(from, segment.to(), length),
                sag: sag_of(from, segment),
            });
        }
        along += length;
    }
    legs
}

/// The way a piece leaves its start, or arrives at its end.
fn tangent_of(leg: &Leg, end: bool) -> Option<Point> {
    let ways = match leg.segment {
        Segment::Cubic { first, second, to } if end => {
            vec![direction_of(second, to), direction_of(first, to)]
        }
        Segment::Cubic { first, second, .. } => vec![
            direction_of(leg.from, first),
            direction_of(leg.from, second),
        ],
        Segment::Line { .. } => Vec::new(),
    };
    ways.into_iter()
        .flatten()
        .next()
        .or_else(|| direction_of(leg.from, leg.segment.to()))
}

/// One piece of a route as path data, run a hair past each end, or cut off exactly at its ends.
pub(crate) fn leg_path(leg: &Leg, overlapping: bool) -> String {
    let at = |point: Point| Point {
        x: round_coord(point.x),
        y: round_coord(point.y),
    };
    let segment = match leg.segment {
        Segment::Line { to } => PathStep::Line { to: at(to) },
        Segment::Cubic { first, second, to } => PathStep::Cubic {
            first: at(first),
            second: at(second),
            to: at(to),
        },
    };
    let piece = path_data(
        &[PathStep::Move { to: at(leg.from) }, segment],
        Spelling::Route,
    );
    if !overlapping {
        return piece;
    }
    let zero = Point { x: 0.0, y: 0.0 };
    let start = tangent_of(leg, false).unwrap_or(zero);
    let end = tangent_of(leg, true).unwrap_or(zero);
    let to = leg.segment.to();
    format!(
        "M{},{} L{} L{},{}",
        coord(leg.from.x - start.x * OVERLAP),
        coord(leg.from.y - start.y * OVERLAP),
        &piece[1..],
        coord(to.x + end.x * OVERLAP),
        coord(to.y + end.y * OVERLAP),
    )
}
