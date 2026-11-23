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
use crate::constants::STRAND;
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

/// A route moved `by` to the left of its way, as a strand of a cable stands beside the cable's
/// route: each run moves square to itself, so each corner moves along both of its runs.
fn beside(points: &[Point], by: f64) -> Vec<Point> {
    let normal = |a: Point, b: Point| {
        let length = (b.x - a.x).hypot(b.y - a.y);
        if length == 0.0 {
            return Point { x: 0.0, y: 0.0 };
        }
        Point {
            x: (a.y - b.y) / length,
            y: (b.x - a.x) / length,
        }
    };
    let last = points.len().saturating_sub(1);
    (points.iter().enumerate())
        .map(|(at, &point)| {
            let before = (at > 0).then(|| normal(points[at - 1], point));
            let after = (at < last).then(|| normal(point, points[at + 1]));
            let shift = match (before, after) {
                (Some(one), Some(other)) if one == other => one,
                (Some(one), Some(other)) => Point {
                    x: one.x + other.x,
                    y: one.y + other.y,
                },
                (Some(one), None) | (None, Some(one)) => one,
                (None, None) => Point { x: 0.0, y: 0.0 },
            };
            Point {
                x: point.x + shift.x * by,
                y: point.y + shift.y * by,
            }
        })
        .collect()
}

/// Each relationship's place in its cable, by id: its strand, counted from the cable's left in
/// the picture's order, and how many strands the cable holds.
fn strands(
    content: &Content,
    riders: &BTreeMap<String, String>,
) -> BTreeMap<String, (usize, usize)> {
    let mut cables: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    }) {
        let leader = riders.get(&edge.id).unwrap_or(&edge.id);
        cables
            .entry(leader.as_str())
            .or_default()
            .push(edge.id.as_str());
    }
    (cables.into_values())
        .filter(|members| members.len() > 1)
        .flat_map(|members| {
            let count = members.len();
            (members.into_iter().enumerate()).map(move |(at, id)| (id.to_owned(), (at, count)))
        })
        .collect()
}

/// Every relationship along its route, in the picture's order. A rider runs beside the route of
/// the relationship it rides with, a strand of their cable, and wears no words.
fn edges_of(
    content: &Content,
    measured: &Measured,
    placed: &Placed,
    (boxes, riders): (&BTreeMap<&str, Rect>, &BTreeMap<String, String>),
) -> Vec<DrawingEdge<EdgeFacts>> {
    let routes: BTreeMap<&str, _> = placed
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect();
    let strands = strands(content, riders);
    ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    })
    .into_iter()
    .map(|edge| {
        let ridden = riders.get(&edge.id);
        let route = routes.get(ridden.unwrap_or(&edge.id).as_str());
        let curve = match route {
            Some(route) if route.points.len() >= 2 => {
                let points = strands.get(&edge.id).map_or_else(
                    || route.points.clone(),
                    |&(at, count)| {
                        beside(
                            &route.points,
                            (at as f64 - (count - 1) as f64 / 2.0) * STRAND,
                        )
                    },
                );
                curve_through(&points, true)
            }
            _ => self_loop(boxes.get(edge.from.as_str()).copied().unwrap_or(Rect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            })),
        };
        // A plate as wide as the narrow one carries the narrow plate's lines.
        let label = measured
            .labels
            .get(&edge.id)
            .zip(
                route
                    .filter(|_| ridden.is_none())
                    .and_then(|route| route.label),
            )
            .map(|(wide, bounds)| {
                let narrow = measured.narrow_labels.get(&edge.id);
                let words = narrow.filter(|narrow| (narrow.width - bounds.width).abs() < 1e-6);
                PlacedLabel {
                    bounds,
                    measured: words.unwrap_or(wide).clone(),
                }
            });
        DrawingEdge {
            echelon: strands.get(&edge.id).is_some_and(|&(at, _)| at % 2 == 1),
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
    riders: &BTreeMap<String, String>,
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
    let edges = edges_of(content, measured, placed, (&boxes, riders));
    ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: placed.width,
        height: placed.height,
        cards,
        containers,
        edges,
    }
}
