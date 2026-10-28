//! Parse one measured hierarchy and dispatch without changing the Solver contract.

use super::tree::Nesting;
use crate::{Graphviz, graph::Node, json::J};

/// The root option carrying the placed drawing.
pub(crate) const BLOCKS_PLACED: &str = "archboard.blocks.placed";
/// The root option selecting Blocks or one of Track's nesting policies.
pub(crate) const BLOCKS_NESTING: &str = "archboard.blocks.nesting";

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
    let nesting = Nesting::named(graph.option(BLOCKS_NESTING).unwrap_or("inline"))?;
    if nesting == Nesting::Blocks {
        super::planned::observe(&graph)?;
    }
    let placed = super::legacy::place(&graph, nesting, host)?;
    Ok(answer(
        &graph,
        placed.width,
        placed.height,
        vec![(BLOCKS_PLACED, placed.json().text())],
    ))
}
