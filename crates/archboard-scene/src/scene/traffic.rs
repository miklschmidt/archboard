//! Traffic as data: the route a train of pulses rides, how fast
//! and how far apart they fly, and what one pulse looks like. The scene
//! answers the numbers of its pulses (`pulse_train`); each painter animates them
//! as it can.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::Curve;
use crate::scene::colour::Colour;

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
