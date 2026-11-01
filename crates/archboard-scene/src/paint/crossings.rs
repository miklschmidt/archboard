//! What each line must not show: the ink beneath a line that crosses over it,
//! the ink another route of its trunk draws for it, and the ink behind a
//! see-through label. Each is cut from the line's own group by one mask.

use std::collections::HashMap;

use crate::drawing::{DrawingBridge, Edge};
use crate::geometry::{Curve, Point, Rect, Segment, curve_bounds, inflate, round_coord};
use crate::js;
use crate::paint::build::route;
use crate::paint::design::{PILL_RADIUS, RAILS};
use crate::paint::junctions::mark_radius;
use crate::paint::shared_ink::shared_ink;
use crate::paint::slab::boxed;
use crate::paint::styles::{HEAD_LENGTH, RAIL_GAP, stroke_width};
use crate::scene::traffic::pulse_breadth;
use crate::scene::{Cap, Colour, Definition, Mask, MaskId, Purpose, Shape, Stroke};

/// A restrained sliver of clear space on each side of the upper arc.
const BRIDGE_INK_GAP: f64 = 1.5;
/// The clear space round a join's mark where a line that crosses beside the join is cut.
const CUT_GAP: f64 = 3.0;

/// One piece of ink a route must not show, drawn black in its mask.
pub(super) struct Cutout {
    pub edge_id: String,
    pub shape: Shape,
}

/// How wide a route is drawn: a double line by its rails.
fn drawn_width(routed: &Edge, double: &impl Fn(&Edge) -> bool) -> f64 {
    if double(routed) {
        RAILS
    } else {
        stroke_width(routed.edge.emphasis)
    }
}

/// Lower ink cleared narrowly beneath each hop that crosses over it.
pub(super) fn crossing_cutouts(
    edges: &[Edge],
    bridges: &[DrawingBridge],
    double: &impl Fn(&Edge) -> bool,
) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for bridge in bridges {
        let Some(upper) = edges
            .iter()
            .rev()
            .find(|routed| routed.edge.id == bridge.edge_id)
        else {
            continue;
        };
        let width = drawn_width(upper, double);
        let stroke = if bridge.join == Some(true) {
            (mark_radius(width) + CUT_GAP) * 2.0
        } else {
            width + BRIDGE_INK_GAP * 2.0
        };
        let shape = Shape::path(Purpose::Line, route(&bridge.curve))
            .unfilled()
            .stroked(Stroke::new(Colour::Black, stroke).rounded());
        for edge_id in &bridge.under {
            cutouts.push(Cutout {
                edge_id: edge_id.clone(),
                shape: shape.clone(),
            });
        }
    }
    cutouts
}

/// A piece of a route carried on past the route's end by a distance, when it reaches that end.
fn past_end(piece: &Curve, end: Point, past: f64) -> Curve {
    let count = piece.segments.len();
    let last = piece.segments[count - 1];
    let before = if count >= 2 {
        piece.segments[count - 2].to()
    } else {
        piece.from
    };
    let to = last.to();
    let length = js::hypot(to.x - before.x, to.y - before.y);
    if !matches!(last, Segment::Line { .. })
        || length == 0.0
        || js::hypot(to.x - end.x, to.y - end.y) > 0.5
    {
        return piece.clone();
    }
    let scale = (length + past) / length;
    let reached = Point {
        x: before.x + (to.x - before.x) * scale,
        y: before.y + (to.y - before.y) * scale,
    };
    let mut segments = piece.segments[..count - 1].to_vec();
    segments.push(Segment::Line { to: reached });
    Curve {
        from: piece.from,
        segments,
    }
}

/// Every stretch of a route's ink another route of its trunk draws, hidden.
pub(super) fn trunk_cutouts(routes: &[Edge], double: &impl Fn(&Edge) -> bool) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for (index, pieces) in shared_ink(routes) {
        let routed = &routes[index];
        let width = drawn_width(routed, double);
        let end = routed.curve.end();
        for piece in pieces {
            let breadth = round_coord(pulse_breadth(width) + BRIDGE_INK_GAP * 2.0);
            cutouts.push(Cutout {
                edge_id: routed.edge.id.clone(),
                shape: Shape::path(
                    Purpose::Cutout,
                    route(&past_end(&piece, end, width + BRIDGE_INK_GAP)),
                )
                .unfilled()
                .stroked(Stroke::new(Colour::Black, breadth).capped(Cap::Butt)),
            });
        }
    }
    cutouts
}

/// A route short of each end by a distance, where that end is a straight run.
fn short_of_ends(curve: &Curve, start: f64, end: f64) -> Curve {
    let toward = |from: Point, to: Point, by: f64| {
        let length = js::hypot(to.x - from.x, to.y - from.y);
        let share = if length > by { by / length } else { 0.0 };
        Point {
            x: from.x + (to.x - from.x) * share,
            y: from.y + (to.y - from.y) * share,
        }
    };
    let mut segments = curve.segments.clone();
    let from = match segments.first() {
        Some(Segment::Line { to }) => toward(curve.from, *to, start),
        _ => curve.from,
    };
    let count = segments.len();
    if let (Some(Segment::Line { to }), true) = (segments.last().copied(), count > 0) {
        let before = if count >= 2 {
            segments[count - 2].to()
        } else {
            from
        };
        segments[count - 1] = Segment::Line {
            to: toward(to, before, end),
        };
    }
    Curve { from, segments }
}

/// The gap down the middle of every double line: its rails are one stroke with its
/// core cut out, so a line shows what it crosses over, and its heads stay whole.
pub(super) fn rail_cutouts(routes: &[Edge], double: &impl Fn(&Edge) -> bool) -> Vec<Cutout> {
    routes
        .iter()
        .filter(|routed| double(routed))
        .map(|routed| {
            let start = if routed.edge.two_way {
                HEAD_LENGTH
            } else {
                0.0
            };
            Cutout {
                edge_id: routed.edge.id.clone(),
                shape: Shape::path(
                    Purpose::Cutout,
                    route(&short_of_ends(&routed.curve, start, HEAD_LENGTH)),
                )
                .unfilled()
                .stroked(Stroke::new(Colour::Black, RAIL_GAP).capped(Cap::Butt)),
            }
        })
        .collect()
}

/// Whether two boxes share area.
fn overlaps(a: Rect, b: Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/// Every line's ink hidden behind a label that is drawn see-through.
pub(super) fn label_cutouts(edges: &[Edge], labels: &[Rect]) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for label in labels {
        let shape =
            Shape::rect(Purpose::Box, boxed(*label), Some(PILL_RADIUS)).filled(Colour::Black);
        for routed in edges
            .iter()
            .filter(|routed| overlaps(inflate(curve_bounds(&routed.curve), 1.0), *label))
        {
            cutouts.push(Cutout {
                edge_id: routed.edge.id.clone(),
                shape: shape.clone(),
            });
        }
    }
    cutouts
}

/// The masks of a drawing: their definitions, and each affected route's mask.
pub(super) struct Masks {
    pub definitions: Vec<Definition>,
    pub masks: HashMap<String, MaskId>,
}

/// Each route's cutouts: routes in the order they were first cut, and each cutout once.
type Grouped = Vec<(String, Vec<Shape>)>;

/// The cutouts sorted by route, a cutout alike to one before it left out.
fn grouped(cutouts: Vec<Cutout>) -> Grouped {
    let mut grouped: Grouped = Vec::new();
    for Cutout { edge_id, shape } in cutouts {
        let at = if let Some(at) = grouped.iter().position(|(id, _)| *id == edge_id) {
            at
        } else {
            grouped.push((edge_id, Vec::new()));
            grouped.len() - 1
        };
        let shapes = &mut grouped[at].1;
        if !shapes.contains(&shape) {
            shapes.push(shape);
        }
    }
    grouped
}

/// One route's mask: all of the route's ink but its cutouts.
fn mask_of(routed: &Edge, cutouts: Vec<Shape>) -> Mask {
    let bounds = boxed(inflate(curve_bounds(&routed.curve), 18.0));
    let mut shapes = vec![Shape::rect(Purpose::Box, bounds, None).filled(Colour::White)];
    shapes.extend(cutouts);
    Mask {
        id: MaskId {
            line: routed.edge.id.clone(),
        },
        bounds,
        shapes,
    }
}

/// One mask per route with anything to hide, keeping all the rest of its ink.
pub(super) fn crossing_masks(edges: &[Edge], cutouts: Vec<Cutout>) -> Masks {
    let mut masks = HashMap::new();
    let mut definitions = Vec::new();
    for (edge_id, shapes) in grouped(cutouts) {
        if let Some(routed) = edges.iter().rev().find(|routed| routed.edge.id == edge_id) {
            let mask = mask_of(routed, shapes);
            masks.insert(edge_id, mask.id.clone());
            definitions.push(Definition::Mask(mask));
        }
    }
    Masks { definitions, masks }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_double_line_keeps_its_rails_whole_under_its_heads() {
        let curve = Curve {
            from: Point { x: 0.0, y: 0.0 },
            segments: vec![Segment::Line {
                to: Point { x: 100.0, y: 0.0 },
            }],
        };
        let short = short_of_ends(&curve, HEAD_LENGTH, HEAD_LENGTH);
        assert_eq!(short.from.x, HEAD_LENGTH);
        assert_eq!(short.segments[0].to().x, 100.0 - HEAD_LENGTH);
    }
}
