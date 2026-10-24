//! What each line must not show: the ink beneath a line that crosses over it,
//! the ink another route of its trunk draws for it, and the ink behind a
//! see-through label. Each is cut from the line's own group by one mask.

use std::collections::HashMap;

use crate::attrs;
use crate::drawing::{DrawingBridge, Edge};
use crate::geometry::{Curve, Point, Rect, Segment, coord, curve_bounds, inflate, path_of};
use crate::js;
use crate::markup::{Markup, concat, content_id, markup_of, tag, wrap};
use crate::paint::design::PILL_RADIUS;
use crate::paint::junctions::mark_radius;
use crate::paint::shared_ink::shared_ink;
use crate::paint::styles::stroke_width;

/// A restrained sliver of clear space on each side of the upper arc.
const BRIDGE_INK_GAP: f64 = 1.5;
/// The clear space round a join's mark where a line that crosses beside the join is cut.
const CUT_GAP: f64 = 3.0;

/// One piece of ink a route must not show, as mask markup.
pub struct Cutout {
    pub edge_id: String,
    pub markup: Markup,
}

/// How thick a pulse is on a line of one width: the width of its core.
pub fn pulse_breadth(line_width: f64) -> f64 {
    js::js_max(1.5, line_width + 0.6)
}

/// Lower ink cleared narrowly beneath each hop that crosses over it.
pub fn crossing_cutouts(edges: &[Edge], bridges: &[DrawingBridge]) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for bridge in bridges {
        let Some(upper) = edges.iter().rev().find(|routed| routed.edge.id == bridge.edge_id) else { continue };
        let width = stroke_width(upper.edge.emphasis);
        let stroke =
            if bridge.join == Some(true) { (mark_radius(width) + CUT_GAP) * 2.0 } else { width + BRIDGE_INK_GAP * 2.0 };
        let markup = tag(
            "path",
            attrs! {
                "d": path_of(&bridge.curve),
                "fill": "none",
                "stroke": "black",
                "stroke-width": stroke,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        );
        for edge_id in &bridge.under {
            cutouts.push(Cutout { edge_id: edge_id.clone(), markup: markup.clone() });
        }
    }
    cutouts
}

/// A piece of a route carried on past the route's end by a distance, when it reaches that end.
fn past_end(piece: &Curve, end: Point, past: f64) -> Curve {
    let count = piece.segments.len();
    let last = piece.segments[count - 1];
    let before = if count >= 2 { piece.segments[count - 2].to() } else { piece.from };
    let to = last.to();
    let length = js::hypot(to.x - before.x, to.y - before.y);
    if !matches!(last, Segment::Line { .. }) || length == 0.0 || js::hypot(to.x - end.x, to.y - end.y) > 0.5 {
        return piece.clone();
    }
    let scale = (length + past) / length;
    let reached = Point { x: before.x + (to.x - before.x) * scale, y: before.y + (to.y - before.y) * scale };
    let mut segments = piece.segments[..count - 1].to_vec();
    segments.push(Segment::Line { to: reached });
    Curve { from: piece.from, segments }
}

/// Every stretch of a route's ink another route of its trunk draws, hidden.
pub fn trunk_cutouts(routes: &[Edge]) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for (index, pieces) in shared_ink(routes) {
        let routed = &routes[index];
        let width = stroke_width(routed.edge.emphasis);
        let end = routed.curve.end();
        for piece in pieces {
            cutouts.push(Cutout {
                edge_id: routed.edge.id.clone(),
                markup: tag(
                    "path",
                    attrs! {
                        "d": path_of(&past_end(&piece, end, width + BRIDGE_INK_GAP)),
                        "stroke-width": coord(pulse_breadth(width) + BRIDGE_INK_GAP * 2.0),
                        "stroke-linecap": "butt",
                        "fill": "none",
                        "stroke": "black",
                    },
                ),
            });
        }
    }
    cutouts
}

/// Whether two boxes share area.
fn overlaps(a: Rect, b: Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/// Every line's ink hidden behind a label that is drawn see-through.
pub fn label_cutouts(edges: &[Edge], labels: &[Rect]) -> Vec<Cutout> {
    let mut cutouts = Vec::new();
    for label in labels {
        let markup = tag(
            "rect",
            attrs! {
                "x": coord(label.x),
                "y": coord(label.y),
                "width": coord(label.width),
                "height": coord(label.height),
                "rx": PILL_RADIUS,
                "fill": "black",
            },
        );
        for routed in edges.iter().filter(|routed| overlaps(inflate(curve_bounds(&routed.curve), 1.0), *label)) {
            cutouts.push(Cutout { edge_id: routed.edge.id.clone(), markup: markup.clone() });
        }
    }
    cutouts
}

/// The masks of a drawing: their definitions, and each affected route's mask id.
pub struct Masks {
    pub definitions: Markup,
    pub masks: HashMap<String, String>,
}

/// One mask per route with anything to hide, keeping all the rest of its ink.
pub fn crossing_masks(edges: &[Edge], cutouts: Vec<Cutout>) -> Masks {
    let mut grouped: Vec<(String, Vec<(String, Markup)>)> = Vec::new();
    for Cutout { edge_id, markup } in cutouts {
        let written = markup_of(&markup);
        let at = match grouped.iter().position(|(id, _)| *id == edge_id) {
            Some(at) => at,
            None => {
                grouped.push((edge_id, Vec::new()));
                grouped.len() - 1
            }
        };
        let paths = &mut grouped[at].1;
        if !paths.iter().any(|(held, _)| *held == written) {
            paths.push((written, markup));
        }
    }
    let mut masks = HashMap::new();
    let mut definitions = Vec::new();
    for (edge_id, paths) in grouped {
        let Some(routed) = edges.iter().rev().find(|routed| routed.edge.id == edge_id) else { continue };
        let rect = inflate(curve_bounds(&routed.curve), 18.0);
        let bounds = attrs! {
            "x": coord(rect.x),
            "y": coord(rect.y),
            "width": coord(rect.width),
            "height": coord(rect.height),
        };
        let mut body = tag("rect", bounds.clone().set("fill", "white"));
        for (_, path) in paths {
            body.extend(path);
        }
        let id = format!("crossing-{}", content_id(&markup_of(&body)));
        masks.insert(edge_id, id.clone());
        definitions.push(wrap(
            "mask",
            attrs! { "id": id, "maskUnits": "userSpaceOnUse", "maskContentUnits": "userSpaceOnUse" }.with(bounds),
            body,
        ));
    }
    Masks {
        definitions: if definitions.is_empty() { Markup::new() } else { wrap("defs", attrs! {}, concat(definitions)) },
        masks,
    }
}
