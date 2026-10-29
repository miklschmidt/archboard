//! Parse one measured hierarchy and dispatch without changing the Solver contract.

use super::tree::Nesting;
use crate::{Graphviz, graph::Node, json::J};

/// The root option carrying the placed drawing.
pub(crate) const BLOCKS_PLACED: &str = "archboard.blocks.placed";
/// The root option selecting Blocks or one of Track's nesting policies.
pub(crate) const BLOCKS_NESTING: &str = "archboard.blocks.nesting";
/// Whether this solve owns the final route coordinates.
pub(crate) const BLOCKS_PLANNED: &str = "archboard.blocks.planned";

pub(crate) use super::legacy::insets_of;

/// A solve's answer: the hierarchy's root, as large as the drawing, carrying it in its options.
fn answer(graph: &Node, width: f64, height: f64, told: Vec<(&str, String)>) -> String {
    let mut options = graph.layout_options.clone().unwrap_or_default();
    for (name, value) in told {
        options.insert(name.to_owned(), value);
    }
    J::obj([
        ("id", J::str(&graph.id)),
        ("x", J::Num(0.0)),
        ("y", J::Num(0.0)),
        ("width", J::Num(width)),
        ("height", J::Num(height)),
        (
            "layoutOptions",
            J::Obj(
                options
                    .into_iter()
                    .map(|(name, value)| (name, J::Str(value)))
                    .collect(),
            ),
        ),
    ])
    .text()
}

/// Lay out a measured hierarchy through one solver call.
///
/// # Errors
///
/// An unreadable graph or a refusal from the selected layout engine.
pub fn lay_out_board(graph: &str, host: &mut dyn Graphviz) -> Result<String, String> {
    let graph: Node = serde_json::from_str(graph)
        .map_err(|error| format!("The measured graph is unreadable: {error}"))?;
    let mode = graph.option(BLOCKS_NESTING).unwrap_or("inline");
    let (placed, frozen) = if mode == "blocks" {
        (hybrid(&graph, host)?, true)
    } else {
        (
            super::legacy::place(&graph, Nesting::named(mode)?, host)?,
            false,
        )
    };
    let mut told = vec![(BLOCKS_PLACED, placed.json().text())];
    if frozen {
        told.push((BLOCKS_PLANNED, "true".to_owned()));
    }
    Ok(answer(&graph, placed.width, placed.height, told))
}

fn hybrid(graph: &Node, host: &mut dyn Graphviz) -> Result<super::assembly::Placed, String> {
    let mut result = Err(super::planned::Refused::from("No guarded Blocks drawing"));
    let mut room = Vec::new();
    for extra in [0.0, 32.0, 64.0] {
        result = try_placements(graph, host, &room, extra)?;
        if result.is_ok() {
            break;
        }
        if let Err(failure) = &result {
            if failure.blocked.is_empty() {
                break;
            }
            room.extend(failure.blocked.iter().cloned());
            room.sort();
            room.dedup();
        }
    }
    result.map_err(|failure| failure.message)
}

fn try_placements(
    graph: &Node,
    host: &mut dyn Graphviz,
    room: &[String],
    extra: f64,
) -> Result<Result<super::assembly::Placed, super::planned::Refused>, String> {
    let mut result = Err(super::planned::Refused::from("No guarded Blocks drawing"));
    for placed in super::legacy::candidates(graph, host, room, extra)? {
        result = super::planned::route_fixed(graph, placed);
        if result.is_ok() {
            break;
        }
    }
    Ok(result)
}
