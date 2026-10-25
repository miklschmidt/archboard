//! A fan whose lanes stand in the wrong order: two lines leave one port along
//! one row, and the outer lane turns back across the inner one. Dropping it a
//! lane before its sibling's puts the fan in order, before folded lanes are
//! exchanged (`orderFans` of `folded-crossings.ts`).

use std::collections::BTreeSet;

use archboard_scene::drawing::{DrawingEdge, EdgeFacts};
use archboard_scene::geometry::{EPSILON, Point, Rect};

use crate::ecma::{hypot, js_max, js_min, sign};

use super::ROUTE_LANE;
use super::folded::{
    Leg, Scene, between, box_on, enters, meets, moved_lane, no_closer, pieces_of, shared_trunk,
};

/// Whether two legs of different routes leave one port along one row, with
/// both lanes off the same side of it: they fan out of one trunk.
fn fanned(one: &Leg, other: &Leg) -> bool {
    let row = one.axis.across();
    one.edge_index != other.edge_index
        && one.axis == other.axis
        && hypot(one.port.x - other.port.x, one.port.y - other.port.y) < EPSILON
        && (row.of(one.corner) - row.of(other.corner)).abs() < EPSILON
        && sign(row.of(one.far) - row.of(one.corner))
            == sign(row.of(other.far) - row.of(other.corner))
}

/// Whether a fan's leg drops on the outer lane and then turns back across its
/// sibling's lane, which runs on past that turn: the crossing a fan draws only
/// because the two lanes stand in the wrong order.
fn crossed_fan(one: &Leg, other: &Leg) -> bool {
    let axis = one.axis;
    let row = axis.across();
    let turn = sign(axis.of(one.beyond) - axis.of(one.far));
    turn == sign(axis.of(other.corner) - axis.of(one.corner))
        && (row.of(other.far) - row.of(other.corner)).abs()
            > (row.of(one.far) - row.of(one.corner)).abs()
        && between(axis.of(other.corner), axis.of(one.far), axis.of(one.beyond))
}

/// The area a lane sweeps moving along its row to `to`, from the row to its far corner.
fn lane_sweep(leg: &Leg, to: f64) -> Rect {
    let axis = leg.axis;
    let row = axis.across();
    box_on(
        axis,
        js_min(axis.of(leg.corner), to),
        js_max(axis.of(leg.corner), to),
        js_min(row.of(leg.corner), row.of(leg.far)),
        js_max(row.of(leg.corner), row.of(leg.far)),
    )
}

/// Where a fan's leg that turns across its sibling's lane should drop instead:
/// a lane before that lane, when the two lines share a trunk and nothing else
/// stands where the lane moves. Nothing when the fan is in order.
fn fan_lane(scene: &Scene<'_>, one: &Leg, other: &Leg) -> Option<f64> {
    if !fanned(one, other) || !crossed_fan(one, other) {
        return None;
    }
    if !shared_trunk(
        &scene.edges[one.edge_index].edge,
        &scene.edges[other.edge_index].edge,
    ) {
        return None;
    }
    let turn = sign(one.axis.of(one.beyond) - one.axis.of(one.far));
    let to = one.axis.of(other.corner) + turn * ROUTE_LANE;
    (!fan_blocked(scene, [one, other], lane_sweep(one, to))).then_some(to)
}

/// Whether a card, a label or another route than the fan's own stands where
/// a fan's lane moves.
fn fan_blocked(scene: &Scene<'_>, legs: [&Leg; 2], swept: Rect) -> bool {
    let own = |index: usize| legs.iter().any(|leg| leg.edge_index == index);
    scene
        .drawing
        .cards
        .iter()
        .any(|card| meets(swept, card.bounds))
        || scene.edges.iter().enumerate().any(|(index, edge)| {
            !own(index)
                && edge
                    .label
                    .as_ref()
                    .is_some_and(|label| meets(swept, label.bounds))
        })
        || pieces_of(&scene.vertices)
            .into_iter()
            .any(|piece| !own(piece.edge_index) && enters(swept, piece.from, piece.to))
}

/// Whether a redrawn route's label still sits on one of its pieces, or it has none.
fn label_on_line(edge: &DrawingEdge<EdgeFacts>, points: &[Point]) -> bool {
    edge.label.as_ref().is_none_or(|label| {
        points
            .windows(2)
            .any(|pair| enters(label.bounds, pair[0], pair[1]))
    })
}

/// Put a fan's crossed lanes in order, when the moved line's label stays on
/// it and nothing comes closer to anything new.
fn order_fan<'a>(scene: &Scene<'a>, one: &Leg, other: &Leg) -> Option<Scene<'a>> {
    let to = fan_lane(scene, one, other)?;
    let moved = moved_lane(scene, one, to)?;
    if !label_on_line(&moved.edge, &moved.points) {
        return None;
    }
    let mut after = scene.clone();
    after.edges[one.edge_index] = moved.edge;
    after.vertices[one.edge_index] = Some(moved.points);
    no_closer(scene, &after, &[one.edge_index]).then_some(after)
}

/// Put every fan whose lanes cross in order, before exchanging folded lanes,
/// marking the routes redrawn.
pub(super) fn order_fans<'a>(
    scene: Scene<'a>,
    legs: &[Leg],
    moved: &mut BTreeSet<usize>,
) -> Scene<'a> {
    let mut current = scene;
    for one in legs {
        for other in legs {
            if moved.contains(&one.edge_index) || moved.contains(&other.edge_index) {
                continue;
            }
            let Some(next) = order_fan(&current, one, other) else {
                continue;
            };
            current = next;
            moved.insert(one.edge_index);
            moved.insert(other.edge_index);
        }
    }
    current
}
