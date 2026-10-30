//! A board's traffic, painted as data (ADR 0027): on every line that carries
//! some, the route its pulses ride and how they move, in the time that lines
//! which keep the same time hand on. The SVG painter draws the pulses.

use std::collections::HashMap;

use crate::drawing::{Edge, Traffic};
use crate::geometry::{Curve, Point, Rect};
use crate::js;
use crate::paint::build::{Items, grouped};
use crate::paint::colour::{Share, tinted};
use crate::paint::palette::Palette;
use crate::paint::relay::{Lane, relay_rhythms, rim_length};
use crate::route::{route_length, shortened_by};
use crate::scene::{Colour, Group, Item, Motion, PulseLook, Role, TrafficMark};

/// The air between the base of an arrowhead and the pulse that sinks into it.
const AIR: f64 = 1.0;

const BODY_LIGHT: Share = Share {
    light: 0.65,
    dark: 0.5,
};
const HOT_LIGHT: Share = Share {
    light: 0.9,
    dark: 0.8,
};

/// How a pulse on a line is drawn: its relationship's colour at full strength
/// with white mixed in, and more of it in the front.
pub(super) fn pulse_look(ink: &Colour, line_width: f64, palette: &Palette) -> PulseLook {
    PulseLook {
        head: tinted(ink, Some(&palette.glow), BODY_LIGHT),
        hot: tinted(ink, Some(&palette.glow), HOT_LIGHT),
        line_width,
    }
}

/// The part of a route a pulse rides: the route with the base of its arrowhead
/// and a little air taken off its end, and how long it is.
pub(super) fn ride_of(curve: &Curve, head_reach: f64) -> Option<(Curve, f64)> {
    let ride = shortened_by(curve, head_reach + AIR)?;
    let length = route_length(&ride);
    Some((ride, length))
}

/// One line that carries traffic, and what its pulses are drawn in.
pub(super) struct TrafficLine<'a> {
    pub routed: &'a Edge,
    pub traffic: Traffic,
    /// How far back from the route's end its arrowhead's ink reaches.
    pub head_reach: f64,
    /// The route its pulses ride, when it runs on into the ports at its ends.
    pub into: Curve,
    /// The relationship's colour at full strength.
    pub ink: Colour,
    pub line_width: f64,
}

/// A board's traffic: each line's in a layer of its own, by relationship id.
pub(super) fn paint_traffic(
    lines: &[TrafficLine<'_>],
    cards: &[(&str, Rect)],
    palette: &Palette,
) -> HashMap<String, Items> {
    let rides: HashMap<&str, Option<(Curve, f64)>> = lines
        .iter()
        .map(|line| {
            (
                line.routed.edge.id.as_str(),
                ride_of(&line.into, line.head_reach),
            )
        })
        .collect();
    let lanes: Vec<Lane> = lines
        .iter()
        .map(|line| {
            let routed = line.routed;
            Lane {
                id: routed.edge.id.clone(),
                from: routed.edge.from.clone(),
                to: routed.edge.to.clone(),
                traffic: line.traffic,
                start: routed.curve.from,
                end: routed.curve.end(),
                length: route_length(&routed.curve),
                ride: rides
                    .get(routed.edge.id.as_str())
                    .and_then(|ride| ride.as_ref())
                    .map_or(0.0, |ride| ride.1),
            }
        })
        .collect();
    let across = |card: &str, from: Point, to: Point| {
        // A card listed twice answers with the last of its boxes, as a map built from the list does.
        match cards.iter().rev().find(|(id, _)| *id == card) {
            Some((_, rect)) => rim_length(*rect, from, to),
            None => js::hypot(from.x - to.x, from.y - to.y),
        }
    };
    let rhythms = relay_rhythms(&lanes, &across);
    lines
        .iter()
        .map(|line| {
            let id = line.routed.edge.id.as_str();
            let ride = rides.get(id).and_then(|ride| ride.as_ref());
            let pulses = match (ride, rhythms.get(id)) {
                (Some((curve, _)), Some(rhythm)) => vec![Item::Traffic(TrafficMark {
                    look: pulse_look(&line.ink, line.line_width, palette),
                    route: curve.clone(),
                    motion: Motion::Steady {
                        speed: rhythm.speed,
                        spacing: rhythm.spacing,
                        phase: rhythm.phase,
                    },
                })],
                _ => Items::new(),
            };
            (
                id.to_owned(),
                grouped(Group::new(Role::Traffic(id.to_owned()), pulses)),
            )
        })
        .collect()
}
