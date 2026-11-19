//! Traffic as data: the route a train of pulses rides, how fast
//! and how far apart they fly, and what one pulse looks like. Each painter
//! animates the pulses as it can; the painter of the scene and every frontend
//! share these dimensions of a pulse.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::Curve;
use crate::js;
use crate::scene::colour::Colour;

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

/// The longest tail a pulse has, where nothing crowds it.
pub const fn longest_tail() -> f64 {
    PULSE_TAIL
}

/// How long a pulse's tail is where pulses are `room` apart: a train fills
/// most of that room, and a tail never runs past its longest.
pub fn pulse_tail(room: f64) -> f64 {
    (room * PULSE_FILL - PULSE_HEAD - PULSE_FRONT).clamp(0.0, PULSE_TAIL)
}

/// How long a pulse is with a tail of some length: its front, its head and that tail.
pub fn pulse_reach(tail: f64) -> f64 {
    PULSE_FRONT + PULSE_HEAD + tail
}

/// How long a pulse with its longest tail is.
pub fn pulse_span() -> f64 {
    PULSE_FRONT + PULSE_HEAD + PULSE_TAIL
}

/// A length with the room a pulse's light takes past it added: how far the
/// light of a line reaches, or what a clock leaves after a pulse has left.
pub fn with_light_room(length: f64) -> f64 {
    length + PULSE_MASK_ROOM
}

/// The stops of a pulse's body, behind its tail: where its head starts, its
/// hot middle, its front, and the dark past its front. Each stop is how far
/// behind the front it stands, whether it takes the pulse's hot colour (else
/// its head colour), and how much light it lets through, from 0 to 1.
pub fn body_stops(head_light: f64) -> [(f64, bool, f64); 4] {
    [
        (PULSE_FRONT + PULSE_HEAD, false, head_light),
        (PULSE_FRONT + PULSE_HEAD * 0.45, true, 0.9),
        (PULSE_FRONT, true, 1.0),
        (0.0, true, 0.0),
    ]
}

/// Where a steady train's bar starts on a piece that starts `along` its
/// route, for a train `phase` along and pulses `period` apart.
pub fn train_shift(phase: f64, along: f64, period: f64) -> f64 {
    js::within(phase - along + PULSE_FRONT, period) - period
}

/// How far a message's bar has slid on a piece that starts `along` its
/// route, at a moment of its turn.
pub fn turn_slide(moment: f64, start: f64, speed: f64, along: f64) -> f64 {
    (moment - start) * speed - along + PULSE_FRONT - pulse_span()
}

/// The moment of its turn a message's bar starts onto a piece that starts
/// `along` its route: its whole pulse and a unit more short of the piece.
pub fn turn_entry(start: f64, speed: f64, along: f64) -> f64 {
    turn_moment(-pulse_span() - 1.0, start, speed, along)
}

/// The moment of its turn a message's bar has slid some way on a piece that
/// starts `along` its route.
pub fn turn_moment(slide: f64, start: f64, speed: f64, along: f64) -> f64 {
    start + (slide + along - PULSE_FRONT + pulse_span()) / speed
}

/// How thick a pulse's core is on a line of one width.
pub fn pulse_breadth(line_width: f64) -> f64 {
    js::js_max(1.5, line_width + 0.6)
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
