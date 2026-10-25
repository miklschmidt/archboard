//! Which answer of a decision leaves from which point. The layout is asked
//! for the points in the order a first layout that holds no answer to a point
//! stood the answers left to right, and for the board's order instead when
//! that crosses fewer lines.

use std::collections::{BTreeMap, HashMap};

use archboard_layout::{
    Content, Edge as GraphEdge, Engine, Measured, Solver, draw, pair_crossings,
};
use archboard_scene::drawing::{MeasuredNode, Painted};
use archboard_scene::geometry::{Point, Rect, Segment};

/// Where an answer first stops below its decision in a drawing: the middle of
/// its words, or else of the card it reaches. By answer id.
fn first_stops(drawing: &Painted) -> HashMap<&str, f64> {
    let cards: HashMap<&str, Rect> = drawing
        .drawing
        .cards
        .iter()
        .map(|card| (card.measured.node.id.as_str(), card.bounds))
        .collect();
    drawing
        .drawing
        .edges
        .iter()
        .map(|edge| {
            let stop = edge
                .label
                .as_ref()
                .map(|label| label.bounds)
                .or_else(|| cards.get(edge.edge.to.as_str()).copied())
                .map_or(0.0, |bounds| bounds.x + bounds.width / 2.0);
            (edge.edge.id.as_str(), stop)
        })
        .collect()
}

/// `Array.prototype.sort`'s reading of a comparator's number: no number
/// (`NaN`) is a tie.
fn ordering(difference: f64) -> std::cmp::Ordering {
    difference
        .partial_cmp(&0.0)
        .unwrap_or(std::cmp::Ordering::Equal)
}

/// The graph's content with each decision's answers in the order a layout that
/// holds no answer to a point stood them, left to right, and whether that
/// order differs from the board's. Asked for its points in the board's order
/// instead, Graphviz keeps that order even where it costs a crossing, as when
/// a loop runs back up past one answer.
async fn in_free_order<S: Solver>(
    content: &Content,
    measure: &Measured,
    solver: &S,
) -> Result<Option<Content>, String> {
    let unpointed = Measured {
        nodes: measure
            .nodes
            .iter()
            .map(|(id, node)| {
                let node = MeasuredNode {
                    pointed: None,
                    ..node.clone()
                };
                (id.clone(), node)
            })
            .collect(),
        ..measure.clone()
    };
    let free = track(content, &unpointed, solver).await?;
    let stops = first_stops(&free);
    let stop = |id: &str| stops.get(id).copied().unwrap_or(f64::NAN);
    let mut reordered: HashMap<&str, f64> = HashMap::new();
    for (id, node) in &measure.nodes {
        if node.pointed.is_none() {
            continue;
        }
        let answers: Vec<&GraphEdge> = content
            .edges
            .iter()
            .filter(|edge| &edge.from == id)
            .collect();
        let mut orders: Vec<f64> = answers.iter().map(|edge| edge.order).collect();
        orders.sort_by(|one, other| ordering(one - other));
        let mut placed = answers;
        placed.sort_by(|one, other| {
            let apart = stop(&one.id) - stop(&other.id);
            if apart != 0.0 && !apart.is_nan() {
                ordering(apart)
            } else {
                ordering(one.order - other.order)
            }
        });
        for (edge, order) in placed.into_iter().zip(orders) {
            reordered.insert(&edge.id, order);
        }
    }
    let edges: Vec<GraphEdge> = content
        .edges
        .iter()
        .map(|edge| GraphEdge {
            order: reordered
                .get(edge.id.as_str())
                .copied()
                .unwrap_or(edge.order),
            ..edge.clone()
        })
        .collect();
    if edges
        .iter()
        .zip(&content.edges)
        .all(|(edge, was)| edge.order == was.order)
    {
        return Ok(None);
    }
    Ok(Some(Content {
        edges,
        ..content.clone()
    }))
}

/// How many times a drawing's lines cross each other.
fn crossings_of(drawing: &Painted) -> usize {
    let lines: Vec<Vec<Point>> = drawing
        .drawing
        .edges
        .iter()
        .map(|edge| {
            std::iter::once(edge.curve.from)
                .chain(edge.curve.segments.iter().map(Segment::to))
                .collect()
        })
        .collect();
    pair_crossings(&lines)
}

/// The graph laid out with each decision's answers asked for their points in
/// the order of a first layout (`in_free_order`), or in the board's order when
/// that crosses fewer lines: asked for its points, Graphviz can still stand
/// answers' steps against the first layout's order. The first layout's order
/// wins a tie.
pub(super) async fn laid_out<S: Solver>(
    content: &Content,
    measure: &Measured,
    solver: &S,
) -> Result<Painted, String> {
    let free = in_free_order(content, measure, solver).await?;
    let first = track(free.as_ref().unwrap_or(content), measure, solver).await?;
    let crossed = crossings_of(&first);
    if free.is_none() || crossed == 0 {
        return Ok(first);
    }
    let board = track(content, measure, solver).await?;
    Ok(if crossings_of(&board) < crossed {
        board
    } else {
        first
    })
}

/// The graph laid out by the track engine, as an architecture is.
async fn track<S: Solver>(
    content: &Content,
    measure: &Measured,
    solver: &S,
) -> Result<Painted, String> {
    draw(
        content,
        measure,
        None,
        &BTreeMap::new(),
        Engine::Track,
        solver,
    )
    .await
}
