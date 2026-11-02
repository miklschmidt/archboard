//! The drawing once laid out, turned from boxes to shapes: a decision's box
//! cut back to its diamond, and every line that meets a shape carried on to
//! its outline, to the middle of the side it crosses for a decision or a
//! terminal (`ports.rs`).

use std::collections::{HashMap, HashSet};

use archboard_scene::drawing::{Bridged, DrawingEdge, EdgeFacts, Painted};
use archboard_scene::geometry::{Curve, EPSILON, Point, Rect, Segment};
use archboard_scene::js;
use archboard_scene::request::FlowchartShape;

use super::SIDE_RUN;
use super::graph::Graph;
use super::ports::{at_shape_points, on_outline};

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

/// The lines that keep their place, because the bridges are settled: each that
/// carries a hop, which every line of a trunk does though a bridge names only
/// one of them, and each that a bridge passes over.
fn settled(plain: &[DrawingEdge<EdgeFacts>], bridged: &Bridged<EdgeFacts>) -> HashSet<String> {
    let curves: HashMap<&str, &Curve> = plain
        .iter()
        .map(|line| (line.edge.id.as_str(), &line.curve))
        .collect();
    let hopped = bridged
        .edges
        .iter()
        .filter(|line| curves.get(line.edge.id.as_str()) != Some(&&line.curve));
    hopped
        .map(|line| &line.edge.id)
        .chain(bridged.bridges.iter().flat_map(|bridge| &bridge.under))
        .cloned()
        .collect()
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
    let settled = settled(&drawing.drawing.edges, &drawing.bridged);
    let shaped = |id: &str| -> Shaped { Some((graph.shape(id)?, *boxes.get(id)?)) };
    let card_of = |routed: &DrawingEdge<EdgeFacts>, from: Shaped, to: Shaped| {
        let id = match (pointed(from), pointed(to)) {
            (None, Some(_)) => &routed.edge.from,
            (Some(_), None) => &routed.edge.to,
            _ => return None,
        };
        let free = !settled.contains(&routed.edge.id);
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
    use archboard_scene::drawing::{DrawingBridge, Emphasis};

    use super::*;

    fn line(id: &str, y: f64) -> DrawingEdge<EdgeFacts> {
        DrawingEdge {
            edge: EdgeFacts {
                id: id.to_owned(),
                from: "a".to_owned(),
                to: "b".to_owned(),
                kind: "next".to_owned(),
                emphasis: Emphasis::Normal,
                traffic: None,
                two_way: false,
            },
            curve: Curve {
                from: Point { x: 0.0, y },
                segments: vec![Segment::Line {
                    to: Point { x: 100.0, y },
                }],
            },
            label: None,
        }
    }

    #[test]
    fn every_line_of_a_bridged_trunk_and_each_line_under_it_keep_their_place() {
        let plain = [
            line("named", 0.0),
            line("trunk", 0.0),
            line("under", 50.0),
            line("free", 90.0),
        ];
        let hop = Curve {
            from: Point { x: 40.0, y: 0.0 },
            segments: vec![Segment::Line {
                to: Point { x: 60.0, y: 0.0 },
            }],
        };
        let hopped = |id: &str| {
            let mut carrier = line(id, 0.0);
            carrier.curve.segments.insert(0, hop.segments[0]);
            carrier
        };
        let bridged = Bridged {
            edges: vec![
                hopped("named"),
                hopped("trunk"),
                line("under", 50.0),
                line("free", 90.0),
            ],
            bridges: vec![DrawingBridge {
                edge_id: "named".to_owned(),
                under: vec!["under".to_owned()],
                curve: hop.clone(),
                join: None,
            }],
        };
        let kept = settled(&plain, &bridged);
        let mut kept: Vec<&str> = kept.iter().map(String::as_str).collect();
        kept.sort_unstable();
        assert_eq!(kept, ["named", "trunk", "under"]);
    }
}
