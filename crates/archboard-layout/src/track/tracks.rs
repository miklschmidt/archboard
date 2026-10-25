//! Tracks (TASK-349). Each channel's units, a trunk or a lone net that turns,
//! get tracks in the order that crosses least, each on the highest track below
//! every overlapping unit above it. Two units that overlap stand in the order
//! they are given tracks, so an order's cost is the sum over every overlapping
//! pair of what the earlier one costs above the later one.

use crate::ecma::{abs, max, min, or, sign, sorted_by};
use crate::track::chains::LANE;

/// The cost of an order that runs two lines down one column: never taken when avoidable.
const STACKED: f64 = 100.0;

/// What a channel assigns a track to: a run between pins that rise from it and pins that drop from it.
#[derive(Clone, Debug)]
pub(crate) struct Unit {
    pub tops: Vec<f64>,
    pub bottoms: Vec<f64>,
    pub low: f64,
    pub high: f64,
    pub order: f64,
}

/// Whether two units' runs overlap, so they cannot share a track.
fn overlap(one: &Unit, other: &Unit) -> bool {
    one.low - LANE / 2.0 < other.high + LANE / 2.0 && other.low - LANE / 2.0 < one.high + LANE / 2.0
}

/// How many of some pins fall strictly inside a unit's run.
fn inside(pins: &[f64], unit: &Unit) -> f64 {
    pins.iter()
        .filter(|&&x| x > unit.low && x < unit.high)
        .count() as f64
}

/// How many crossings one unit above another costs.
fn cost_above(above: &Unit, below: &Unit) -> f64 {
    let stacked = below
        .tops
        .iter()
        .any(|top| above.bottoms.iter().any(|bottom| abs(top - bottom) < LANE));
    if stacked {
        STACKED
    } else {
        inside(&below.tops, above) + inside(&above.bottoms, below)
    }
}

/// How much a unit would rather be above the units it overlaps than below them.
fn preference_of(unit: usize, units: &[Unit]) -> f64 {
    units.iter().enumerate().fold(0.0, |sum, (other, one)| {
        if other == unit || !overlap(&units[unit], one) {
            sum
        } else {
            sum + sign(cost_above(one, &units[unit]) - cost_above(&units[unit], one))
        }
    })
}

/// Whether one unit must be above another: below it, the other would run a
/// line down the column of one of its own.
fn must_be_above(above: &Unit, below: &Unit) -> bool {
    overlap(above, below)
        && cost_above(below, above) >= STACKED
        && cost_above(above, below) < STACKED
}

/// The units in their preferred order, except that no unit is placed before a
/// unit that must be above it.
fn keeping_stacks(units: &[Unit], preferred: Vec<usize>) -> Vec<usize> {
    let mut waiting = preferred;
    let mut ordered = Vec::with_capacity(waiting.len());
    while !waiting.is_empty() {
        let ready = waiting
            .iter()
            .position(|&unit| {
                !waiting
                    .iter()
                    .any(|&other| other != unit && must_be_above(&units[other], &units[unit]))
            })
            .unwrap_or(0);
        ordered.push(waiting.remove(ready));
    }
    ordered
}

/// A unit and one it passes, higher first: before the move, each unit passed
/// stands above a unit moving up, and below one moving down.
fn ordered<'u>(up: bool, unit: &'u Unit, other: &'u Unit) -> (&'u Unit, &'u Unit) {
    if up { (other, unit) } else { (unit, other) }
}

/// What moving the unit at one place of an order to another place saves, or
/// nothing when it would pass a unit that must stay on its side.
fn saving(units: &[Unit], order: &[usize], from: usize, to: usize) -> Option<f64> {
    let unit = &units[order[from]];
    let up = to < from;
    let passed: Vec<&Unit> = (if up {
        &order[to..from]
    } else {
        &order[(from + 1)..=to]
    })
    .iter()
    .map(|&other| &units[other])
    .filter(|other| overlap(unit, other))
    .collect();
    if passed.iter().any(|other| {
        let (higher, lower) = ordered(up, unit, other);
        must_be_above(higher, lower)
    }) {
        return None;
    }
    Some(passed.iter().fold(0.0, |sum, other| {
        let (higher, lower) = ordered(up, unit, other);
        sum + cost_above(higher, lower) - cost_above(lower, higher)
    }))
}

/// Improve an order one move at a time: a unit moves up or down past others
/// wherever that crosses fewer lines, until no move saves any.
fn least_crossing(units: &[Unit], order: &mut Vec<usize>) {
    let mut moved = true;
    while moved {
        moved = false;
        for from in 0..order.len() {
            let savings: Vec<Option<f64>> = (0..order.len())
                .map(|to| {
                    if to == from {
                        Some(0.0)
                    } else {
                        saving(units, order, from, to)
                    }
                })
                .collect();
            let best = savings.iter().enumerate().fold(from, |chosen, (to, one)| {
                let theirs = savings[chosen];
                if theirs.is_some_and(|theirs| one.unwrap_or(0.0) > theirs) {
                    to
                } else {
                    chosen
                }
            });
            if best == from {
                continue;
            }
            let unit = order.remove(from);
            order.insert(best, unit);
            moved = true;
        }
    }
}

/// Stack a channel's units on tracks: each unit's place in `units` and its
/// track, in the order the tracks were given.
pub(crate) fn stack_units(units: &[Unit]) -> Vec<(usize, usize)> {
    let preference: Vec<f64> = (0..units.len())
        .map(|unit| preference_of(unit, units))
        .collect();
    let indices: Vec<usize> = (0..units.len()).collect();
    let sorted = sorted_by(&indices, |&one, &other| {
        or(
            or(
                preference[other] - preference[one],
                units[one].low - units[other].low,
            ),
            units[one].order - units[other].order,
        )
    });
    let mut ordered = keeping_stacks(units, sorted);
    least_crossing(units, &mut ordered);
    let mut tracks: Vec<(usize, usize)> = Vec::with_capacity(ordered.len());
    for unit in ordered {
        let above: Vec<f64> = tracks
            .iter()
            .filter(|&&(other, _)| overlap(&units[unit], &units[other]))
            .map(|&(_, track)| track as f64)
            .collect();
        let track = if above.is_empty() {
            0
        } else {
            max(above.iter().copied()) as usize + 1
        };
        tracks.push((unit, track));
    }
    tracks
}

/// A unit that is no net: a run between pins that rise from its track and pins that drop from it.
pub(crate) fn unit_across(tops: Vec<f64>, bottoms: Vec<f64>, order: f64) -> Unit {
    let low = min(tops.iter().chain(&bottoms).copied());
    let high = max(tops.iter().chain(&bottoms).copied());
    Unit {
        tops,
        bottoms,
        low,
        high,
        order,
    }
}
