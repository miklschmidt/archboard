//! The drawing a solve's geometry describes: every card and container at its
//! box, every relationship along its route with its label, and every group
//! region with its caption and what it gathers.

use std::collections::{BTreeMap, HashSet};

use archboard_scene::drawing::{
    ArchitectureDrawing, DrawingEdge, DrawingNode, DrawingRegion, EdgeFacts, NodeFacts,
    PlacedLabel, ReadingDirection,
};
use archboard_scene::geometry::{Curve, Point, Rect, curve_through, path_of};
use indexmap::IndexMap;

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

/// What a group's region in one container holds, for a viewer to light it
/// with: the cards and containers the group gathers there, and every card
/// inside one of those that is in the group too.
fn region_members(
    content: &Content,
    gathered: Option<&IndexMap<String, String>>,
    group: &str,
    parent: Option<&str>,
) -> Vec<String> {
    let parents: BTreeMap<&str, Option<&str>> = content
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node.parent.as_deref()))
        .collect();
    let held: HashSet<&str> = content
        .nodes
        .iter()
        .filter(|node| {
            node.parent.as_deref() == parent
                && gathered
                    .and_then(|map| map.get(&node.id))
                    .is_some_and(|at| at == group)
        })
        .map(|node| node.id.as_str())
        .collect();
    let inside = |id: &str| {
        let mut at = Some(id);
        while let Some(here) = at {
            if held.contains(here) {
                return true;
            }
            at = parents.get(here).copied().flatten();
        }
        false
    };
    content
        .nodes
        .iter()
        .filter(|node| {
            held.contains(node.id.as_str()) || (node.is_member_of(group) && inside(&node.id))
        })
        .map(|node| node.id.clone())
        .collect()
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
            path: path_of(&curve),
            curve,
            label,
        }
    })
    .collect()
}

/// Every group region the solve placed whose group has a caption.
fn regions_of(content: &Content, measured: &Measured, placed: &Placed) -> Vec<DrawingRegion> {
    let groups = measured.groups.as_ref();
    placed
        .regions
        .iter()
        .filter_map(|region| {
            let words = groups?.captions.get(&region.group)?;
            let members = region_members(
                content,
                groups.map(|groups| &groups.placing),
                &region.group,
                region.parent.as_deref(),
            );
            Some(DrawingRegion {
                group: region.group.clone(),
                parent: region.parent.clone(),
                members,
                bounds: region.bounds,
                caption: PlacedLabel {
                    bounds: region.caption,
                    measured: words.clone(),
                },
                depth: region.depth,
            })
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
    let regions = regions_of(content, measured, placed);
    ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: placed.width,
        height: placed.height,
        cards,
        containers,
        edges,
        regions: (!regions.is_empty()).then_some(regions),
    }
}
