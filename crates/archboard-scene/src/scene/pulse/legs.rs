//! A route cut into the pieces a beam of light is drawn on, each a straight
//! run or one bend, and each piece fitted with its frame, its light and its bar.

use crate::geometry::{Curve, Point, Rect, Segment, segment_start};
use crate::js;
use crate::route::segment_length;
use crate::scene::traffic::Motion;

use super::{
    BAR_ROOM, Bar, GLOW, LEAST_PIECE, LegMotion, OVERLAP, PULSE_FRONT, PULSE_MASK_ROOM, PULSE_SPAN,
    PulseLeg, turn_moment, turn_slide,
};

/// One piece of a route worth a beam, before its pulse is fitted to it.
pub(super) struct Piece {
    from: Point,
    segment: Segment,
    /// How far along the route the piece starts.
    along: f64,
    /// How long the piece is along its ink.
    length: f64,
}

/// A route cut into the pieces a beam is drawn on: each a straight run or one
/// bend, long enough to show and going somewhere.
pub(super) fn pieces_of(curve: &Curve) -> Vec<Piece> {
    let mut pieces = Vec::new();
    let mut along = 0.0;
    for (index, segment) in curve.segments.iter().enumerate() {
        let from = segment_start(curve, index);
        let length = segment_length(from, segment);
        if length >= LEAST_PIECE && direction_of(from, segment.to()).is_some() {
            pieces.push(Piece {
                from,
                segment: *segment,
                along,
                length,
            });
        }
        along += length;
    }
    pieces
}

/// One piece with its frame, its light's box, its bar and how the bar slides.
pub(super) fn leg_of(piece: &Piece, core: f64, span: f64, motion: Motion) -> PulseLeg {
    let Piece {
        from,
        segment,
        along,
        length,
    } = *piece;
    let to = segment.to();
    let zero = Point { x: 0.0, y: 0.0 };
    let start = tangent_of(piece, false).unwrap_or(zero);
    let end = tangent_of(piece, true).unwrap_or(zero);
    let height = core + GLOW[0].0 + 2.0 * sag_of(from, &segment) + 2.0 * BAR_ROOM;
    let (bar, motion) = match motion {
        Motion::Steady {
            speed,
            spacing: _,
            phase,
        } => (
            Bar {
                from: -span - 1.0,
                width: length + 2.0 * span + 2.0,
                height,
            },
            LegMotion::Steady {
                shift: js::within(phase - along + PULSE_FRONT, span) - span,
                period: span,
                speed,
            },
        ),
        Motion::Turn {
            speed,
            cycle,
            start,
        } => {
            let enters = js::js_max(0.0, turn_moment(-PULSE_SPAN - 1.0, start, speed, along));
            let leaves = js::js_min(cycle, turn_moment(length + 1.0, start, speed, along));
            (
                Bar {
                    from: 0.0,
                    width: span,
                    height,
                },
                LegMotion::Turn {
                    enters,
                    leaves,
                    from: turn_slide(enters, start, speed, along),
                    to: turn_slide(leaves, start, speed, along),
                    start,
                    speed,
                    along,
                    cycle,
                },
            )
        }
    };
    PulseLeg {
        from,
        segment,
        length,
        turn: libm::atan2(to.y - from.y, to.x - from.x),
        stretch: js::hypot(to.x - from.x, to.y - from.y) / length,
        lead: Point {
            x: from.x - start.x * OVERLAP,
            y: from.y - start.y * OVERLAP,
        },
        trail: Point {
            x: to.x + end.x * OVERLAP,
            y: to.y + end.y * OVERLAP,
        },
        room: room_of(from, &segment, core),
        bar,
        motion,
    }
}

/// The box the light of a piece stays inside: its ends and control points,
/// and the reach of its widest glow past them.
fn room_of(from: Point, segment: &Segment, core: f64) -> Rect {
    let reach = f64::midpoint(core, GLOW[0].0) + PULSE_MASK_ROOM;
    let mut points = vec![from, segment.to()];
    if let Segment::Cubic { first, second, .. } = *segment {
        points.push(first);
        points.push(second);
    }
    let x = js::min(points.iter().map(|point| point.x)) - reach;
    let y = js::min(points.iter().map(|point| point.y)) - reach;
    Rect {
        x,
        y,
        width: js::max(points.iter().map(|point| point.x)) + reach - x,
        height: js::max(points.iter().map(|point| point.y)) + reach - y,
    }
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

/// The way a piece leaves its start, or arrives at its end.
fn tangent_of(piece: &Piece, end: bool) -> Option<Point> {
    let ways = match piece.segment {
        Segment::Cubic { first, second, to } if end => {
            [direction_of(second, to), direction_of(first, to)]
        }
        Segment::Cubic { first, second, .. } => [
            direction_of(piece.from, first),
            direction_of(piece.from, second),
        ],
        Segment::Line { .. } => [None, None],
    };
    ways.into_iter()
        .flatten()
        .next()
        .or_else(|| direction_of(piece.from, piece.segment.to()))
}
