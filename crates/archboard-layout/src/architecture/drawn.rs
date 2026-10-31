//! The drawing a solve's geometry describes: every card and container at its
//! box, and every relationship along its route with its label.

use std::collections::BTreeMap;

use archboard_scene::drawing::{
    ArchitectureDrawing, DrawingEdge, DrawingNode, EdgeFacts, NodeFacts, PlacedLabel,
    ReadingDirection,
};
use archboard_scene::geometry::{Curve, Point, Rect, curve_through};

use super::choosing::Placed;
use super::content::Content;
use super::measured::Measured;
use crate::ecma;

/// How far a part's loop to itself reaches out of its side.
const SELF_LOOP_REACH: f64 = 26.0;

/// A loop off a part's right face, for a relationship from a part to itself:
/// out square, down, and square back in, rounded like every other route.
fn self_loop(bounds: Rect) -> Curve {
    let x = bounds.x + bounds.width;
    let top = Point {
        x,
        y: bounds.y + bounds.height / 3.0,
    };
    let bottom = Point {
        x,
        y: bounds.y + (bounds.height * 2.0) / 3.0,
    };
    curve_through(
        &[
            top,
            Point {
                x: top.x + SELF_LOOP_REACH,
                y: top.y,
            },
            Point {
                x: bottom.x + SELF_LOOP_REACH,
                y: bottom.y,
            },
            bottom,
        ],
        false,
    )
}

/// Every relationship along its route, in the board's order.
fn edges_of(
    content: &Content,
    measured: &Measured,
    placed: &Placed,
    boxes: &BTreeMap<&str, Rect>,
) -> Vec<DrawingEdge<EdgeFacts>> {
    let routes: BTreeMap<&str, _> = placed
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect();
    ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    })
    .into_iter()
    .map(|edge| {
        let route = routes.get(edge.id.as_str());
        let curve = match route {
            Some(route) if route.points.len() >= 2 => curve_through(&route.points, true),
            _ => self_loop(boxes.get(edge.from.as_str()).copied().unwrap_or(Rect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            })),
        };
        let label = measured
            .labels
            .get(&edge.id)
            .zip(route.and_then(|route| route.label))
            .map(|(words, bounds)| PlacedLabel {
                bounds,
                measured: words.clone(),
            });
        DrawingEdge {
            edge: edge.facts(),
            curve,
            label,
        }
    })
    .collect()
}

/// The drawing a solve's geometry describes.
pub(crate) fn drawing_of(
    content: &Content,
    measured: &Measured,
    placed: &Placed,
) -> ArchitectureDrawing<NodeFacts, EdgeFacts> {
    let cards: Vec<DrawingNode<NodeFacts>> = placed
        .cards
        .iter()
        .filter_map(|card| {
            let measured = measured.nodes.get(&card.id)?.clone();
            Some(DrawingNode {
                measured,
                bounds: card.bounds,
                depth: card.depth,
            })
        })
        .collect();
    let containers: Vec<DrawingNode<NodeFacts>> = placed
        .frames
        .iter()
        .filter_map(|frame| {
            let node = measured.nodes.get(&frame.id)?;
            // The header as wide as the layout made room for (TASK-486).
            let header = frame
                .header
                .and_then(|at| node.headers.as_ref()?.get(at))
                .unwrap_or(node);
            Some(DrawingNode {
                measured: header.clone(),
                bounds: frame.bounds,
                depth: frame.depth,
            })
        })
        .collect();
    let boxes: BTreeMap<&str, Rect> = cards
        .iter()
        .chain(&containers)
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let edges = edges_of(content, measured, placed, &boxes);
    ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: placed.width,
        height: placed.height,
        cards,
        containers,
        edges,
    }
}
