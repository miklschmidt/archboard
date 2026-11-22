//! An architecture drawn from one graph plan through the host's [`Solver`].
//! The engine named places its parts and relationships, fits its page, and
//! settles its crossings. The painter and flowcharts consume that drawing.

mod choosing;
mod content;
mod drawn;
mod graph;
mod measured;
mod page;
mod solving;

use std::collections::{BTreeMap, HashSet};
use std::hash::BuildHasher;

use archboard_scene::drawing::{
    ArchitectureDrawing, EdgeFacts, NodeFacts, Painted, PaintedDrawing,
};
pub use content::{Content, Edge, Node};
pub use graph::Standings;
pub use measured::Measured;
use serde::{Deserialize, Serialize};
pub use solving::{Solver, Unsolved, lay_out_across};

use crate::routes::{LineLook, bridge_crossings, bridge_unfolded, unfold_crossings};

/// Which engine lays an architecture out (ADR 0096). The host names it on every render.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    /// Each container packed as a block of its own, its lines planned before they are routed,
    /// with the lanes' placement where no plan gives every line a clear channel (ADR 0063).
    Blocks,
    /// The same blocks, always placed as Graphviz ranks them, every line routed on lanes of its
    /// own between the ranks.
    Lanes,
}

/// A picture drawn: laid out by the engine named, on a page fitted to it, with
/// its crossings settled.
///
/// `standings` keeps relationships that stand differently in a comparison on
/// separate trunks.
///
/// # Errors
///
/// A solve the host failed or answered unreadably.
pub async fn draw<S: Solver>(
    content: &Content,
    measured: &Measured,
    standings: Option<&Standings>,
    engine: Engine,
    solver: &S,
) -> Result<Painted, String> {
    let graph = graph::compound_graph(content, measured, standings, engine);
    let placed = choosing::placed_blocks(solver, graph).await?;
    let drawing = page::fitted_page(drawn::drawing_of(content, measured, &placed));
    let frozen = placed.planned;
    let bridged = if frozen {
        bridge_unfolded(&drawing, &measured.lines)
    } else {
        bridge_crossings(&drawing, &measured.lines)
    };
    Ok(PaintedDrawing {
        drawing,
        bridged,
        frozen,
    })
}

/// A drawing without the subjects left out. Every box and route it keeps is
/// the drawing's own, and only the hops and cuts where its lines cross are
/// settled again on what is left, from the routes as the crossing pass
/// settled them, so what is left runs where it ran beside what is not drawn.
pub fn shown_drawing<S: BuildHasher>(
    drawing: &Painted,
    unshown: &HashSet<String, S>,
    lines: &BTreeMap<String, LineLook>,
) -> Painted {
    if unshown.is_empty() {
        return drawing.clone();
    }
    let whole = &drawing.drawing;
    let shown = |id: &str| !unshown.contains(id);
    let cards: Vec<_> = whole
        .cards
        .iter()
        .filter(|card| shown(&card.measured.node.id))
        .cloned()
        .collect();
    let containers: Vec<_> = whole
        .containers
        .iter()
        .filter(|node| shown(&node.measured.node.id))
        .cloned()
        .collect();
    let kept: ArchitectureDrawing<NodeFacts, EdgeFacts> = ArchitectureDrawing {
        cards,
        containers,
        edges: whole
            .edges
            .iter()
            .filter(|edge| shown(&edge.edge.id))
            .cloned()
            .collect(),
        ..whole.clone()
    };
    let settled = if drawing.frozen {
        whole.clone()
    } else {
        unfold_crossings(whole)
    };
    let routes = settled
        .edges
        .into_iter()
        .filter(|edge| shown(&edge.edge.id))
        .collect();
    let bridged = bridge_unfolded(
        &ArchitectureDrawing {
            edges: routes,
            ..kept.clone()
        },
        lines,
    );
    PaintedDrawing {
        drawing: kept,
        bridged,
        frozen: drawing.frozen,
    }
}
