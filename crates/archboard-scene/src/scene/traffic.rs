//! Traffic as data: the route a train of pulses rides, how fast and how far
//! apart they fly, and what one pulse looks like; and the pulse train, the
//! numbers of those pulses that every painter draws. The scene answers where a
//! piece's bar stands at a moment; each painter spells the numbers and runs the
//! clock (ADR 0084).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::{Curve, Point, Rect, Segment, round_coord, segment_start};
use crate::js;
use crate::route::segment_length;
use crate::scene::colour::Colour;

/// How thick a pulse's core is on a line of one width.
pub(crate) fn pulse_breadth(line_width: f64) -> f64 {
    js::max([1.5, line_width + 0.6])
}

/// The colours of a pulse and how thick the line it rides is.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PulseLook {
    /// The colour of the beam's body.
    pub head: Colour,
    /// The colour of its hot front, nearer white than the body is.
    pub hot: Colour,
    /// How thick what it rides is, so a heavier line carries a heavier pulse.
    pub line_width: f64,
}

/// How the pulses on a route move.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Motion {
    /// A steady train: pulses `spacing` apart flying at `speed`, one `phase`
    /// along the route at time zero.
    Steady {
        /// How fast the pulses fly, in diagram units a second.
        speed: f64,
        /// How far apart the pulses are, in diagram units.
        spacing: f64,
        /// How far along the route the first pulse stands at time zero, in diagram units.
        phase: f64,
    },
    /// One pulse a turn of a clock `cycle` seconds long, leaving the route's
    /// start `start` seconds into it and flying at `speed`.
    Turn {
        /// How fast the pulse flies, in diagram units a second.
        speed: f64,
        /// How long one turn of the clock is, in seconds.
        cycle: f64,
        /// How many seconds into the turn the pulse leaves the route's start.
        start: f64,
    },
}

/// A train of pulses on a route.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct TrafficMark {
    /// The pulses' colours, and how thick the line they ride is.
    pub look: PulseLook,
    /// The part of the line the pulses ride.
    pub route: Curve,
    /// How the pulses move.
    pub motion: Motion,
}

/// How long a pulse's hot front is, along its line.
const PULSE_FRONT: f64 = 3.0;
/// How long a pulse's head is, behind its front.
const PULSE_HEAD: f64 = 12.0;
/// How long a pulse's tail is at most, behind its head.
const PULSE_TAIL: f64 = 56.0;
/// How far a pulse's light reaches past the line it rides, either side.
const PULSE_MASK_ROOM: f64 = 2.0;
/// The share of the room between pulses that a pulse fills.
const PULSE_FILL: f64 = 0.8;
/// How long a pulse with its longest tail is.
const PULSE_SPAN: f64 = PULSE_FRONT + PULSE_HEAD + PULSE_TAIL;
/// How a pulse falls off across its line: how much wider than its core each
/// layer of the glow is, and how much light it lets through.
const GLOW: [(f64, f64); 4] = [(6.0, 0.07), (3.4, 0.2), (1.3, 0.5), (0.0, 0.9)];
/// A layer wider than this stops exactly at the ends of its piece.
const HALO_OVER: f64 = 1.0;
/// How sharply a tail fades.
const TAIL_CURVE: f64 = 2.3;
/// How bright a tail is where it meets the head.
const TAIL_LIGHT: f64 = 0.6;
/// How many stops describe a tail.
const TAIL_STEPS: u32 = 9;
/// How far a bar overruns the mask of its piece.
const BAR_ROOM: f64 = 1.0;
/// The shortest piece of a route worth a beam of its own.
const LEAST_PIECE: f64 = 0.5;
/// How far the narrow, bright layers of a piece's mask run into the next piece.
const OVERLAP: f64 = 0.5;

/// The numbers of one traffic mark's pulses, which every painter draws: one
/// gradient, the glow it is seen through, and the pieces of the route it slides along.
#[derive(Clone, Debug, PartialEq)]
pub struct PulseTrain {
    /// How thick a pulse's core is.
    pub core: f64,
    /// How long the gradient is, along each piece's frame: one spacing of a
    /// steady train, or one whole pulse.
    pub span: f64,
    /// Whether the gradient repeats, as a steady train's does.
    pub repeats: bool,
    /// How long one turn of the motion takes, in seconds: a steady train slides
    /// one spacing in it.
    pub cycle: f64,
    /// The gradient's stops, from its back to its front.
    pub stops: Vec<PulseStop>,
    /// The layers of the glow, from the widest and faintest to the core.
    pub layers: [GlowLayer; 4],
    /// The pieces of the route the pulses slide along, in order.
    pub legs: Vec<PulseLeg>,
}

/// One stop of a pulse's gradient.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PulseStop {
    /// Where it stands along the gradient, from 0 to 1.
    pub offset: f64,
    /// Whether it takes the pulse's hot colour, else its head colour.
    pub hot: bool,
    /// How much light it lets through, from 0 to 1.
    pub light: f64,
}

/// One layer of the glow a pulse is seen through.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GlowLayer {
    /// How wide the layer is across its line.
    pub width: f64,
    /// How much light it lets through, from 0 to 1.
    pub light: f64,
    /// Whether it stops exactly at the ends of its piece, else it runs a hair
    /// into the pieces beside it, from `lead` to `trail`.
    pub exact: bool,
}

/// One piece of a route a pulse slides along, with the frame it is drawn in:
/// translated to `from`, turned by `turn` and stretched along x by `stretch`.
#[derive(Clone, Debug, PartialEq)]
pub struct PulseLeg {
    /// Where the piece starts.
    pub from: Point,
    /// The piece.
    pub segment: Segment,
    /// How long the piece is along its ink.
    pub length: f64,
    /// How far the frame turns from the x axis to the piece's chord, in radians.
    pub turn: f64,
    /// How much the frame stretches along x: the chord over the length.
    pub stretch: f64,
    /// Where the narrow layers of the glow start, a hair before `from`.
    pub lead: Point,
    /// Where they end, a hair past the piece's end.
    pub trail: Point,
    /// The box the piece's light stays inside.
    pub room: Rect,
    /// The bar the gradient is painted on, in the piece's frame.
    pub bar: Bar,
    /// How the bar slides along the frame's x axis.
    pub motion: LegMotion,
}

/// The bar a piece's gradient is painted on, centred across the frame's x axis.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bar {
    /// Where it starts along x, before it slides.
    pub from: f64,
    /// How long it is along x.
    pub width: f64,
    /// How tall it is across x.
    pub height: f64,
}

/// How a piece's bar slides: what [`pulse_slide`] reads to place it at a moment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LegMotion {
    /// A steady train: the bar starts `shift` along and slides one `period`
    /// every `period / speed` seconds, over and over.
    Steady {
        /// Where the bar stands at time zero.
        shift: f64,
        /// How far apart the pulses are.
        period: f64,
        /// How fast they fly, in diagram units a second.
        speed: f64,
    },
    /// One pulse a turn of a clock `cycle` seconds long: on the piece from the
    /// moment `enters` to the moment `leaves`, where its bar has slid `from`
    /// and `to`.
    Turn {
        /// The moment of the turn the bar starts onto the piece.
        enters: f64,
        /// The moment of the turn the bar has left the piece.
        leaves: f64,
        /// How far the bar has slid when it enters.
        from: f64,
        /// How far the bar has slid when it leaves.
        to: f64,
        /// How many seconds into the turn the pulse leaves the route's start.
        start: f64,
        /// How fast the pulse flies, in diagram units a second.
        speed: f64,
        /// How far along the route the piece starts.
        along: f64,
        /// How long one turn of the clock is, in seconds.
        cycle: f64,
    },
}

/// The numbers of a traffic mark's pulses.
pub fn pulse_train(mark: &TrafficMark) -> PulseTrain {
    let core = pulse_breadth(mark.look.line_width);
    let (span, tail, repeats, cycle) = match mark.motion {
        Motion::Steady { speed, spacing, .. } => {
            let period = round_coord(spacing);
            (period, pulse_tail(period), true, period / speed)
        }
        Motion::Turn { cycle, .. } => (PULSE_SPAN, PULSE_TAIL, false, cycle),
    };
    let legs = pieces_of(&mark.route)
        .into_iter()
        .map(|piece| leg_of(&piece, core, span, mark.motion))
        .collect();
    PulseTrain {
        core,
        span,
        repeats,
        cycle,
        stops: stops_of(span, tail),
        layers: GLOW.map(|(over, light)| GlowLayer {
            width: core + over,
            light,
            exact: over > HALO_OVER,
        }),
        legs,
    }
}

/// How far a piece's bar has slid at a moment of the painter's clock, or none
/// while a message's pulse is off the piece.
pub fn pulse_slide(motion: &LegMotion, seconds: f64) -> Option<f64> {
    match *motion {
        LegMotion::Steady {
            shift,
            period,
            speed,
        } => Some(shift + js::within(seconds * speed, period)),
        LegMotion::Turn {
            enters,
            leaves,
            start,
            speed,
            along,
            cycle,
            ..
        } => {
            let moment = js::within(seconds, cycle);
            (moment >= enters && moment <= leaves).then(|| turn_slide(moment, start, speed, along))
        }
    }
}

/// How far a turn's clock carries a pulse across lines of some lengths, in
/// order: the lines, and the room the last pulse's light takes to leave.
pub(crate) fn turn_distance(lengths: &[f64]) -> f64 {
    lengths.iter().fold(0.0, |sum, length| sum + length) + (PULSE_SPAN + PULSE_MASK_ROOM)
}

/// How long a pulse's tail is where pulses are `room` apart: a train fills
/// most of that room, and a tail never runs past its longest.
fn pulse_tail(room: f64) -> f64 {
    (room * PULSE_FILL - PULSE_HEAD - PULSE_FRONT).clamp(0.0, PULSE_TAIL)
}

/// The stops of a pulse with a tail of some length, on a gradient `span` long,
/// its front at the far end: the tail's, when it has one, then its body's.
fn stops_of(span: f64, tail: f64) -> Vec<PulseStop> {
    let reach = PULSE_FRONT + PULSE_HEAD + tail;
    let stop = |behind: f64, hot: bool, light: f64| PulseStop {
        offset: (span - behind) / span,
        hot,
        light,
    };
    let mut stops = Vec::new();
    if tail >= 1.0 {
        for step in 0..TAIL_STEPS {
            let share = f64::from(step) / f64::from(TAIL_STEPS);
            stops.push(stop(
                reach - tail * share,
                false,
                TAIL_LIGHT * js::pow(share, TAIL_CURVE),
            ));
        }
    }
    stops.extend([
        stop(PULSE_FRONT + PULSE_HEAD, false, TAIL_LIGHT),
        stop(PULSE_FRONT + PULSE_HEAD * 0.45, true, 0.9),
        stop(PULSE_FRONT, true, 1.0),
        stop(0.0, true, 0.0),
    ]);
    stops
}

/// How far a message's bar has slid on a piece that starts `along` its
/// route, at a moment of its turn.
fn turn_slide(moment: f64, start: f64, speed: f64, along: f64) -> f64 {
    (moment - start) * speed - along + PULSE_FRONT - PULSE_SPAN
}

/// The moment of its turn a message's bar has slid some way on a piece that
/// starts `along` its route.
fn turn_moment(slide: f64, start: f64, speed: f64, along: f64) -> f64 {
    start + (slide + along - PULSE_FRONT + PULSE_SPAN) / speed
}

/// One piece of a route worth a beam, before its pulse is fitted to it.
struct Piece {
    from: Point,
    segment: Segment,
    /// How far along the route the piece starts.
    along: f64,
    /// How long the piece is along its ink.
    length: f64,
}

/// A route cut into the pieces a beam is drawn on: each a straight run or one
/// bend, long enough to show and going somewhere.
fn pieces_of(curve: &Curve) -> Vec<Piece> {
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
fn leg_of(piece: &Piece, core: f64, span: f64, motion: Motion) -> PulseLeg {
    let Piece {
        from,
        segment,
        along,
        length,
    } = *piece;
    let to = segment.to();
    let zero = Point { x: 0.0, y: 0.0 };
    let leaving = tangent_of(piece, false).unwrap_or(zero);
    let arriving = tangent_of(piece, true).unwrap_or(zero);
    let height = core + GLOW[0].0 + 2.0 * sag_of(from, &segment) + 2.0 * BAR_ROOM;
    let (bar, motion) = match motion {
        Motion::Steady { speed, phase, .. } => (
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
            let enters = js::max([0.0, turn_moment(-PULSE_SPAN - 1.0, start, speed, along)]);
            let leaves = js::min([cycle, turn_moment(length + 1.0, start, speed, along)]);
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
            x: from.x - leaving.x * OVERLAP,
            y: from.y - leaving.y * OVERLAP,
        },
        trail: Point {
            x: to.x + arriving.x * OVERLAP,
            y: to.y + arriving.y * OVERLAP,
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
