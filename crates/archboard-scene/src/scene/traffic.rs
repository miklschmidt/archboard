//! Traffic as data: the route a train of pulses rides, how fast and how far
//! apart they fly, and what one pulse looks like. A mark answers the beam that
//! every painter draws ([`TrafficMark::beam`]): one gradient, and the route cut
//! into pieces, each with its soft mask, its bar and how that bar slides. A
//! painter only spells the beam in its medium, so the shape and the timing of a
//! pulse live here alone.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ecma::within;
use crate::geometry::{Curve, Point, Rect, Segment, round_coord, segment_start};
use crate::js;
use crate::route::segment_length;
use crate::scene::colour::Colour;
use crate::scene::definition::Stop;
use crate::scene::shape::PathStep;
use crate::sizes::{
    PULSE_FRONT, PULSE_HEAD, PULSE_TAIL, pulse_breadth, pulse_span, with_light_room,
};

/// The share of the room between pulses that a pulse fills.
const PULSE_FILL: f64 = 0.8;
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

/// How long a pulse's tail is where pulses are `room` apart: a train fills
/// most of that room, and a tail never runs past its longest.
fn pulse_tail(room: f64) -> f64 {
    (room * PULSE_FILL - PULSE_HEAD - PULSE_FRONT).clamp(0.0, PULSE_TAIL)
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

/// The light a train of pulses casts, ready to draw: what every bar is painted
/// with, and the pieces of the route it shows through.
#[derive(Clone, Debug, PartialEq)]
pub struct Beam {
    /// What the bar of every piece is painted with.
    pub gradient: BeamGradient,
    /// The route cut into pieces, each a straight run or one bend, in the
    /// order the pulses ride them.
    pub pieces: Vec<BeamPiece>,
}

/// A pulse's colours along the x axis of a piece's frame, from 0 to `span`,
/// its front at the far end.
#[derive(Clone, Debug, PartialEq)]
pub struct BeamGradient {
    /// How long the gradient is.
    pub span: f64,
    /// Whether it starts over every `span`, as a train does. Else its end
    /// colours run on past its ends.
    pub repeat: bool,
    /// Its stops from its back to its front, each with its offset and opacity.
    pub stops: Vec<Stop>,
}

/// One piece of a beam: a bar that slides in the piece's frame, and the soft
/// shape of the piece, which lets the bar's light through.
#[derive(Clone, Debug, PartialEq)]
pub struct BeamPiece {
    /// The frame the bar is drawn in, its x axis along the piece.
    pub frame: Frame,
    /// The box in the picture that the piece's light stays inside.
    pub bounds: Rect,
    /// The layers of the mask, widest and faintest first.
    pub mask: Vec<MaskLayer>,
    /// The bar in the frame, before it rests and slides.
    pub bar: Rect,
    /// How far along the frame's x axis the bar rests before it slides.
    pub rest: f64,
    /// How the bar slides from its rest.
    pub slide: Slide,
}

/// The frame a piece is drawn in: moved to the piece's start, turned along
/// the straight line to its end, and stretched along that line so that the
/// piece's length along its ink spans it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    /// Where the piece starts.
    pub origin: Point,
    /// How far the x axis turns, in radians, from the picture's x axis
    /// towards its y axis.
    pub angle: f64,
    /// How far the x axis stretches: the straight distance between the ends
    /// of the piece over its length along its ink.
    pub stretch: f64,
}

/// One layer of a piece's mask: a white stroke along the piece.
#[derive(Clone, Debug, PartialEq)]
pub struct MaskLayer {
    /// The stroked path, in the picture's own units.
    pub path: Vec<PathStep>,
    /// How wide the stroke is.
    pub width: f64,
    /// How much light the stroke lets through, from 0 to 1.
    pub light: f64,
}

/// How a bar slides along its frame's x axis as the traffic's clock runs.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Slide {
    /// Again and again: `length` at `speed`, then back to where it started.
    /// A train's gradient repeats every `length`, so the jump back shows no seam.
    Loop {
        /// How far the bar slides before it starts over, in diagram units.
        length: f64,
        /// How fast it slides, in diagram units a second.
        speed: f64,
    },
    /// Once in every `cycle` seconds. The bar stands at `from` until `enter`
    /// seconds into the cycle, slides steadily to `to` until `leave`, and
    /// stands at `to` until the cycle ends. Each stand is past an end of the
    /// piece, unless the cycle cuts the trip short there.
    Pass {
        /// How long one turn of the clock is, in seconds.
        cycle: f64,
        /// When in the turn the bar starts to slide.
        enter: f64,
        /// When in the turn the bar stops.
        leave: f64,
        /// Where the bar stands before it slides.
        from: f64,
        /// Where the bar stands after it stops.
        to: f64,
    },
}

impl Slide {
    /// How far the bar has slid at a moment of the traffic's clock, in seconds.
    pub fn at(&self, seconds: f64) -> f64 {
        match *self {
            Slide::Loop { length, speed } => within(seconds * speed, length),
            Slide::Pass {
                cycle,
                enter,
                leave,
                from,
                to,
            } => {
                let moment = within(seconds, cycle);
                if moment <= enter {
                    from
                } else if moment >= leave {
                    to
                } else {
                    from + (to - from) * (moment - enter) / (leave - enter)
                }
            }
        }
    }
}

impl TrafficMark {
    /// The beam that every painter draws for this train of pulses, on its
    /// route as it stands.
    pub fn beam(&self) -> Beam {
        let core = pulse_breadth(self.look.line_width);
        let legs = legs_of(&self.route);
        match self.motion {
            Motion::Steady {
                speed,
                spacing,
                phase,
            } => {
                let period = round_coord(spacing);
                let slide = Slide::Loop {
                    length: period,
                    speed,
                };
                Beam {
                    gradient: gradient_of(&self.look, period, pulse_tail(period), true),
                    pieces: legs
                        .iter()
                        .map(|leg| {
                            // The bar covers the piece and a pulse past each end,
                            // so the repeating gradient fills it wherever it slides.
                            let bar = (-period - 1.0, leg.length + 2.0 * period + 2.0);
                            let rest = within(phase - leg.along + PULSE_FRONT, period) - period;
                            piece_of(leg, core, bar, rest, slide)
                        })
                        .collect(),
                }
            }
            Motion::Turn {
                speed,
                cycle,
                start,
            } => {
                let span = pulse_span();
                Beam {
                    gradient: gradient_of(&self.look, span, PULSE_TAIL, false),
                    pieces: legs
                        .iter()
                        .map(|leg| {
                            let slide = pass_of(leg, speed, cycle, start);
                            piece_of(leg, core, (0.0, span), 0.0, slide)
                        })
                        .collect(),
                }
            }
        }
    }
}

/// One piece of a route, where it starts along the route, and how long it is.
struct Leg {
    from: Point,
    segment: Segment,
    along: f64,
    length: f64,
}

/// A route cut into the pieces a beam is drawn on: each straight run and each
/// bend that is long enough to carry light.
fn legs_of(curve: &Curve) -> Vec<Leg> {
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
            });
        }
        along += length;
    }
    legs
}

/// How a message's bar slides on one piece: it enters a whole pulse and a
/// unit short of the piece, and leaves a unit past its end, within the turn.
fn pass_of(leg: &Leg, speed: f64, cycle: f64, start: f64) -> Slide {
    let slid = |moment: f64| (moment - start) * speed - leg.along + PULSE_FRONT - pulse_span();
    let moment_of = |slide: f64| start + (slide + leg.along - PULSE_FRONT + pulse_span()) / speed;
    let enter = js::js_max(0.0, moment_of(-pulse_span() - 1.0));
    let leave = js::js_min(cycle, moment_of(leg.length + 1.0));
    Slide::Pass {
        cycle,
        enter,
        leave,
        from: slid(enter),
        to: slid(leave),
    }
}

/// One piece of a beam, its bar starting and reaching as far as `bar` says.
fn piece_of(leg: &Leg, core: f64, bar: (f64, f64), rest: f64, slide: Slide) -> BeamPiece {
    let height = core + GLOW[0].0 + 2.0 * sag_of(leg.from, &leg.segment) + 2.0 * BAR_ROOM;
    let joined = leg_path(leg, true);
    let exact = leg_path(leg, false);
    let to = leg.segment.to();
    BeamPiece {
        frame: Frame {
            origin: leg.from,
            angle: libm::atan2(to.y - leg.from.y, to.x - leg.from.x),
            stretch: js::hypot(to.x - leg.from.x, to.y - leg.from.y) / leg.length,
        },
        bounds: bounds_of(leg, core),
        mask: GLOW
            .iter()
            .map(|&(over, light)| MaskLayer {
                path: if over > HALO_OVER {
                    exact.clone()
                } else {
                    joined.clone()
                },
                width: core + over,
                light,
            })
            .collect(),
        bar: Rect {
            x: bar.0,
            y: -height / 2.0,
            width: bar.1,
            height,
        },
        rest,
        slide,
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
fn tangent_of(leg: &Leg, end: bool) -> Option<Point> {
    let ways = match leg.segment {
        Segment::Cubic { first, second, to } if end => {
            [direction_of(second, to), direction_of(first, to)]
        }
        Segment::Cubic { first, second, .. } => [
            direction_of(leg.from, first),
            direction_of(leg.from, second),
        ],
        Segment::Line { .. } => [None, None],
    };
    ways.into_iter()
        .flatten()
        .next()
        .or_else(|| direction_of(leg.from, leg.segment.to()))
}

/// One piece of a route as a path, run a hair past each end, or cut off
/// exactly at its ends.
fn leg_path(leg: &Leg, overlapping: bool) -> Vec<PathStep> {
    let segment = match leg.segment {
        Segment::Line { to } => PathStep::Line { to },
        Segment::Cubic { first, second, to } => PathStep::Cubic { first, second, to },
    };
    if !overlapping {
        return vec![PathStep::Move { to: leg.from }, segment];
    }
    let zero = Point { x: 0.0, y: 0.0 };
    let start = tangent_of(leg, false).unwrap_or(zero);
    let end = tangent_of(leg, true).unwrap_or(zero);
    let to = leg.segment.to();
    vec![
        PathStep::Move {
            to: Point {
                x: leg.from.x - start.x * OVERLAP,
                y: leg.from.y - start.y * OVERLAP,
            },
        },
        PathStep::Line { to: leg.from },
        segment,
        PathStep::Line {
            to: Point {
                x: to.x + end.x * OVERLAP,
                y: to.y + end.y * OVERLAP,
            },
        },
    ]
}

/// The box the light of a piece stays inside: its ends and control points,
/// and the reach of its widest light past them.
fn bounds_of(leg: &Leg, core: f64) -> Rect {
    let reach = with_light_room(f64::midpoint(core, GLOW[0].0));
    let mut points = vec![leg.from, leg.segment.to()];
    if let Segment::Cubic { first, second, .. } = leg.segment {
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

/// The gradient of a pulse with a tail of some length, `span` long.
fn gradient_of(look: &PulseLook, span: f64, tail: f64, repeat: bool) -> BeamGradient {
    let reach = PULSE_FRONT + PULSE_HEAD + tail;
    let stop = |behind: f64, colour: &Colour, light: f64| Stop {
        offset: Some((span - behind) / span),
        colour: colour.clone(),
        opacity: Some(light),
    };
    let mut stops = Vec::new();
    if tail >= 1.0 {
        for step in 0..TAIL_STEPS {
            let share = f64::from(step) / f64::from(TAIL_STEPS);
            stops.push(stop(
                reach - tail * share,
                &look.head,
                TAIL_LIGHT * js::pow(share, TAIL_CURVE),
            ));
        }
    }
    // The body behind the tail: where the head starts, its hot middle, its
    // front, and the dark past its front.
    stops.push(stop(PULSE_FRONT + PULSE_HEAD, &look.head, TAIL_LIGHT));
    stops.push(stop(PULSE_FRONT + PULSE_HEAD * 0.45, &look.hot, 0.9));
    stops.push(stop(PULSE_FRONT, &look.hot, 1.0));
    stops.push(stop(0.0, &look.hot, 0.0));
    BeamGradient {
        span,
        repeat,
        stops,
    }
}
