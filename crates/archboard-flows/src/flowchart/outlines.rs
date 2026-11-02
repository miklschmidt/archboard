//! The drawing once laid out, turned from boxes to shapes: a decision's box
//! cut back to its diamond, and every line that meets a shape carried on to
//! its outline, to the middle of the side it crosses for a decision or a
//! terminal (`ports.rs`).

use std::collections::HashMap;

use archboard_scene::drawing::{DrawingBridge, DrawingEdge, EdgeFacts, Painted};
use archboard_scene::geometry::{Curve, EPSILON, Point, Rect, Segment, curve_bounds, inflate};
use archboard_scene::js;
use archboard_scene::request::FlowchartShape;

use super::SIDE_RUN;
use super::graph::Graph;
use super::ports::{at_shape_points, on_outline};

/// How near two straight lanes stand when they draw as one line.
const ONE_LANE: f64 = 3.0;

/// The drawing with each decision's box cut to its diamond: it was laid out
/// wider on either side by an answer's sideways run and its words' room.
pub(super) fn to_diamonds(mut drawing: Painted, graph: &Graph) -> Painted {
    for card in &mut drawing.drawing.cards {
        if graph.shape(&card.measured.node.id) != Some(FlowchartShape::Decision) {
            continue;
        }
        let beside = SIDE_RUN + card.measured.pointed.unwrap_or(0.0);
        card.bounds.x += beside;
        card.bounds.width -= 2.0 * beside;
    }
    drawing
}

/// The shape a line's end meets, and its box; nothing for a box drawn as a card.
type Shaped = Option<(FlowchartShape, Rect)>;

/// The straight piece between two points, or none where they are one point: a
/// piece of no length would turn an arrowhead any way at all.
fn line_between(from: Point, to: Point) -> Option<Segment> {
    let short = js::hypot(to.x - from.x, to.y - from.y) < EPSILON;
    (!short).then_some(Segment::Line { to })
}

/// Where a line's end stands once it is carried on to the shape it meets.
fn carried(shaped: Shaped, point: Point) -> Point {
    shaped.map_or(point, |(shape, bounds)| on_outline(shape, bounds, point))
}

/// A route carried on from its shapes' boxes to their outlines.
fn outlined(curve: Curve, from: Shaped, to: Shaped) -> Curve {
    let last = curve.end();
    let start = carried(from, curve.from);
    let end = carried(to, last);
    let mut segments: Vec<Segment> = line_between(start, curve.from).into_iter().collect();
    segments.extend(curve.segments);
    segments.extend(line_between(last, end));
    Curve {
        from: start,
        segments,
    }
}

/// The box of a shape a line meets at the middle of a side: a decision's
/// diamond, at one of its points, and a terminal, where a flow starts or ends.
fn pointed(shaped: Shaped) -> Option<Rect> {
    shaped
        .filter(|(shape, _)| *shape != FlowchartShape::Loop)
        .map(|(_, bounds)| bounds)
}

/// Whether a bridge stands on a line, or on a lane near enough to draw as one
/// with it. Such a line keeps its place, because the bridges are settled. The
/// place decides and not the bridge's names, which give one line of a trunk.
fn under_a_bridge(curve: &Curve, bridges: &[DrawingBridge]) -> bool {
    let line = inflate(curve_bounds(curve), ONE_LANE);
    bridges.iter().any(|bridge| {
        let piece = curve_bounds(&bridge.curve);
        line.x < piece.x + piece.width
            && piece.x < line.x + line.width
            && line.y < piece.y + piece.height
            && piece.y < line.y + line.height
    })
}

/// The drawing with every line that meets a shape carried on to its outline,
/// and every line that meets a decision or a terminal turned to the middle of
/// the side it crosses.
pub(super) fn with_outlines(mut drawing: Painted, graph: &Graph) -> Painted {
    let boxes: HashMap<String, Rect> = drawing
        .drawing
        .cards
        .iter()
        .map(|card| (card.measured.node.id.clone(), card.bounds))
        .collect();
    let bridges = drawing.bridged.bridges.clone();
    let shaped = |id: &str| -> Shaped { Some((graph.shape(id)?, *boxes.get(id)?)) };
    let card_of = |routed: &DrawingEdge<EdgeFacts>, from: Shaped, to: Shaped| {
        let id = match (pointed(from), pointed(to)) {
            (None, Some(_)) => &routed.edge.from,
            (Some(_), None) => &routed.edge.to,
            _ => return None,
        };
        let free = !under_a_bridge(&routed.curve, &bridges);
        boxes.get(id).copied().filter(|_| free)
    };
    let on_shapes = |routed: &mut DrawingEdge<EdgeFacts>| {
        let from = shaped(&routed.edge.from);
        let to = shaped(&routed.edge.to);
        let card = card_of(routed, from, to);
        let turned = at_shape_points(routed.curve.clone(), pointed(from), pointed(to), card);
        if let (Some(words), Some(_)) = (&mut routed.label, card) {
            let (was, is) = if pointed(from).is_none() {
                (routed.curve.from, turned.from)
            } else {
                (routed.curve.end(), turned.end())
            };
            words.bounds.x += is.x - was.x;
            words.bounds.y += is.y - was.y;
        }
        routed.curve = outlined(turned, from, to);
    };
    drawing.drawing.edges.iter_mut().for_each(on_shapes);
    drawing.bridged.edges.iter_mut().for_each(on_shapes);
    drawing
}

#[cfg(test)]
mod tests {
    use super::*;

    fn straight(from: (f64, f64), to: (f64, f64)) -> Curve {
        let [from, to] = [from, to].map(|(x, y)| Point { x, y });
        Curve {
            from,
            segments: vec![Segment::Line { to }],
        }
    }

    #[test]
    fn a_line_stays_where_a_bridge_stands_on_it_or_on_its_lane() {
        let bridges = [DrawingBridge {
            edge_id: "named".to_owned(),
            under: vec!["crossed".to_owned()],
            curve: straight((100.0, 40.0), (100.0, 60.0)),
            join: Some(true),
        }];
        let stays = |from, to| under_a_bridge(&straight(from, to), &bridges);
        assert!(stays((100.0, 0.0), (100.0, 400.0)), "the line it names");
        assert!(stays((102.0, 0.0), (102.0, 400.0)), "a line of its trunk");
        assert!(stays((0.0, 50.0), (200.0, 50.0)), "a line beneath it");
        assert!(!stays((120.0, 0.0), (120.0, 400.0)), "a lane of its own");
    }
}
