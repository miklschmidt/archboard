//! How near a hop comes to what it keeps clear of: cards, labels, titles,
//! arrowheads, junction marks, other lines' ink and other hops, each as a
//! share of the clear space kept from it. A hop is crowded where something
//! comes within that space; where every arc a crossing could have is
//! crowded, the one that keeps the most stands (`crossings`).

use archboard_scene::geometry::{Curve, Point, Rect, curve_bounds, inflate, segment_start};

use crate::ecma::{js_min, max, min, sign};

use super::clearance::curve_boxes;
use super::drawn_lines::{Axis, Run, SHARED_INK, fixed_of, line_runs};
use super::hops::{Hop, HopScene, curve_end, overlaps};
use super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS};

/// Clear space a hop keeps from a card, a label, a title or an arrowhead: twice
/// what it keeps from a line, since an arc five points from a label's edge
/// reads as touching it.
const BOX_CLEARANCE: f64 = BRIDGE_CLEARANCE * 2.0;

/// Clear space between hops on crossing lines: a hop's radius, twice what hops
/// on parallel lines keep, since an arc bulging across another's path reads as
/// one knot with it.
pub(super) const CROSSWISE_CLEARANCE: f64 = BRIDGE_RADIUS;

/// How far apart two boxes lie: the larger of their gaps across and down,
/// below 0 by as far as one must move to clear the other where they overlap.
/// A box widened by this much on every side touches the other.
fn gap(a: Rect, b: Rect) -> f64 {
    max([
        b.x - (a.x + a.width),
        a.x - (b.x + b.width),
        b.y - (a.y + a.height),
        a.y - (b.y + b.height),
    ])
}

/// How near something comes, as a share of the clear space kept from it: at
/// most 1 where it is within that space, below 0 where it overlaps, and
/// nothing where it is beyond it.
fn share(gap: f64, clearance: f64) -> Option<f64> {
    (gap <= clearance).then(|| gap / clearance)
}

/// How near a route piece other than those of the lines a hump rides and
/// passes over comes to it; refined cubic bounds keep the clearance without
/// treating empty hulls as ink.
fn route_crowding(scene: &HopScene<'_>, allowed: &[&Run], bounds: Rect, curve: &Curve) -> f64 {
    let bridge_boxes = curve_boxes(curve);
    let mut nearest = f64::INFINITY;
    for (edge_index, edge) in scene.drawing.edges.iter().enumerate() {
        for (segment_index, segment) in edge.curve.segments.iter().enumerate() {
            let ink = &scene.ink[edge_index][segment_index];
            let mine = allowed.iter().any(|piece| {
                piece.edge_index == edge_index && piece.segment_index == segment_index
            });
            if mine || !overlaps(bounds, ink.bounds) {
                continue;
            }
            let pieces = ink.pieces.get_or_init(|| {
                curve_boxes(&Curve {
                    from: segment_start(&edge.curve, segment_index),
                    segments: vec![*segment],
                })
            });
            nearest = js_min(nearest, pieces_crowding(&bridge_boxes, pieces));
        }
    }
    nearest
}

/// How near the boxes of a crest come to the boxes of a piece of ink, as a
/// share of the clear space kept from a line.
fn pieces_crowding(crest: &[Rect], ink: &[Rect]) -> f64 {
    min(
        std::iter::once(f64::INFINITY).chain(ink.iter().flat_map(|&piece| {
            crest
                .iter()
                .filter_map(move |&bridge_box| share(gap(bridge_box, piece), BRIDGE_CLEARANCE))
        })),
    )
}

/// How near a crest comes to a card, a label, a title, an arrowhead other
/// than its own line's, an accepted hop or a crest standing with it, or
/// another line's ink than the lines it passes over (`beneath`, by their
/// drawers), as a share of the clear space it keeps from each: at most 1
/// where one crowds it, infinite where none comes within reach.
pub(super) fn crowding(
    scene: &HopScene<'_>,
    run: &Run,
    beneath: &[&Run],
    curve: &Curve,
    pending: &[Hop],
) -> f64 {
    crowding_among(scene, run, beneath, curve, scene.hops.iter().chain(pending))
}

/// How near a crest comes to what crowds it (`crowding`), of the hops only
/// those given.
fn crowding_among<'h>(
    scene: &HopScene<'_>,
    run: &Run,
    beneath: &[&Run],
    curve: &Curve,
    hops: impl Iterator<Item = &'h Hop>,
) -> f64 {
    let own = line_runs(&scene.runs, run);
    let curve_bounds = curve_bounds(curve);
    let boxes = scene
        .keepouts
        .iter()
        .filter(|keepout| {
            !own.iter()
                .any(|mine| Some(mine.edge_index) == keepout.edge_index)
        })
        .filter_map(|keepout| share(gap(curve_bounds, keepout.bounds), BOX_CLEARANCE));
    let hops = hops.filter_map(|hop| hop_crowding(hop, curve_bounds, run.axis));
    let nearest = min(std::iter::once(f64::INFINITY).chain(boxes).chain(hops));
    let mut allowed = own;
    for under in beneath {
        allowed.extend(line_runs(&scene.runs, under));
    }
    js_min(
        nearest,
        route_crowding(
            scene,
            &allowed,
            inflate(curve_bounds, BRIDGE_CLEARANCE),
            curve,
        ),
    )
}

/// Whether something crowds a crest (`crowding`).
pub(super) fn crowded(
    scene: &HopScene<'_>,
    run: &Run,
    beneath: &[&Run],
    curve: &Curve,
    pending: &[Hop],
) -> bool {
    crowding(scene, run, beneath, curve, pending) <= 1.0
}

/// How near a crest comes to the arrowhead of its own line, as a share of the
/// clear space it keeps from it: a hop stood so close to the head it leads
/// into reads as a knot at the card.
pub(super) fn own_head_crowding(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> f64 {
    let own: Vec<usize> = line_runs(&scene.runs, run)
        .into_iter()
        .map(|mine| mine.edge_index)
        .collect();
    let bounds = curve_bounds(curve);
    min(
        std::iter::once(f64::INFINITY).chain(scene.keepouts.iter().filter_map(|keepout| {
            keepout
                .edge_index
                .filter(|edge_index| own.contains(edge_index))
                .and_then(|_| share(gap(bounds, keepout.bounds), BOX_CLEARANCE))
        })),
    )
}

/// Whether a crest comes near the arrowhead of its own line (`own_head_crowding`).
pub(super) fn near_own_head(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> bool {
    own_head_crowding(scene, run, curve) <= 1.0
}

/// How near a new crest on a run of `axis` comes to a standing hop, as a share
/// of what their lines keep between them.
fn hop_crowding(hop: &Hop, bounds: Rect, axis: Axis) -> Option<f64> {
    let clearance = if hop.axis == axis {
        BRIDGE_CLEARANCE
    } else {
        CROSSWISE_CLEARANCE
    };
    share(gap(bounds, hop.bounds), clearance * 2.0)
}

/// How near a crest that must stand comes to what crowds it, as `crowding`
/// reads it but for the hops along its axis: a hop on a line beside it that
/// bulges the same way stands beside it as one bundle passing over, and one
/// it would read as one knot with is `knot_crowding`'s. A junction mark it
/// bulges into is `mark_crowding`'s.
pub(super) fn forced_crowding(
    scene: &HopScene<'_>,
    run: &Run,
    beneath: &[&Run],
    curve: &Curve,
) -> f64 {
    let crosswise = scene.hops.iter().filter(|hop| hop.axis != run.axis);
    crowding_among(scene, run, beneath, curve, crosswise)
}

/// How near a crest comes to a junction mark it bulges into, within the span
/// it stands over and on the side it bulges to, as a share of the clear space
/// kept from a mark. A mark at one of its feet, or behind it on a line it
/// passes over, is where a join meets the crossing it must stand over.
pub(super) fn mark_crowding(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> f64 {
    let axis = run.axis;
    let bounds = curve_bounds(curve);
    let span = [axis.of(curve.from), axis.of(curve_end(curve))];
    let line = fixed_of(run);
    let bulge = sign(axis.across().of(centre(bounds)) - line);
    min(
        std::iter::once(f64::INFINITY).chain(scene.marks.iter().filter_map(|&mark| {
            let [along, beside] = [axis, axis.across()].map(|one| one.of(centre(mark)));
            let within = along > min(span) && along < max(span);
            let into = (beside - line).abs() > SHARED_INK && sign(beside - line) == bulge;
            (within && into)
                .then(|| share(gap(bounds, mark), BOX_CLEARANCE))
                .flatten()
        })),
    )
}

/// How near a crest comes to a standing hop it would read as one knot with,
/// as a share of a hop's radius kept on either side: a hop on its own line,
/// or one on a line beside it that bulges toward it as it bulges back.
pub(super) fn knot_crowding(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> f64 {
    let bounds = curve_bounds(curve);
    min(std::iter::once(f64::INFINITY).chain(
        scene
            .hops
            .iter()
            .filter(|hop| knots(run, bounds, hop).is_some())
            .filter_map(|hop| share(gap(bounds, hop.bounds), CROSSWISE_CLEARANCE * 2.0)),
    ))
}

/// Whether a crest on a run, in its bounds, reads as one knot with a hop: on
/// its own line, or facing it from a line beside it. Facing, when it does.
fn knots(run: &Run, bounds: Rect, hop: &Hop) -> Option<bool> {
    let across = run.axis.across();
    let line = fixed_of(run);
    let mine = sign(across.of(centre(bounds)) - line);
    let other = across.of(hop.curve.from);
    let own_line = (other - line).abs() <= SHARED_INK;
    let facing = sign(other - line) == mine && sign(across.of(centre(hop.bounds)) - other) == -mine;
    (hop.axis == run.axis && (own_line || facing)).then_some(facing && !own_line)
}

/// How near a crest on a run comes to a hop it would face from a line beside
/// it, as a share of a hop's radius kept on either side; nothing where it
/// would not face it.
pub(super) fn facing_crowding(run: &Run, curve: &Curve, hop: &Hop) -> Option<f64> {
    let bounds = curve_bounds(curve);
    (knots(run, bounds, hop) == Some(true))
        .then(|| share(gap(bounds, hop.bounds), CROSSWISE_CLEARANCE * 2.0))
        .flatten()
}

/// The standing hops a crest on a run would face from a line beside it,
/// nearer than a hop's radius on either side, by their index.
pub(super) fn facing_hops(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> Vec<usize> {
    let bounds = curve_bounds(curve);
    (0..scene.hops.len())
        .filter(|&index| {
            let hop = &scene.hops[index];
            knots(run, bounds, hop) == Some(true)
                && gap(bounds, hop.bounds) <= CROSSWISE_CLEARANCE * 2.0
        })
        .collect()
}

/// The middle of a box.
fn centre(bounds: Rect) -> Point {
    Point {
        x: bounds.x + bounds.width / 2.0,
        y: bounds.y + bounds.height / 2.0,
    }
}
