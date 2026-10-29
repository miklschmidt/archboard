//! An architecture drawn from one graph plan through the host's [`Solver`].
//! Track or Blocks places its parts and relationships, fits its page, and
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
use archboard_scene::geometry::Rect;
use serde::{Deserialize, Serialize};

pub use content::{Content, Edge, Node};
pub use graph::Standings;
pub use measured::{Measured, MeasuredGroups};
pub use solving::{InProcess, Laying, Solver, Unsolved};

use crate::routes::{
    LineLook, bridge_crossings, bridge_planned, bridge_unfolded, unfold_crossings,
};

/// Which engine lays an architecture out (TASK-348, ADR 0040).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    /// Every relationship on an assigned track between ranks. Multi-member
    /// group regions pack as blocks, with their containers drawn inline.
    #[default]
    Track,
    /// Each container and group region packed as a block of its own.
    Blocks,
}

/// A board drawn: laid out by the engine named, on a page fitted to it, with
/// its crossings settled.
///
/// `standings` keeps relationships that stand differently in a comparison on
/// separate trunks; `entries` names each child that is an entry point of its
/// container, true when it is first (ADR 0044).
///
/// # Errors
///
/// A solve the host failed or answered unreadably.
pub async fn draw<S: Solver>(
    content: &Content,
    measured: &Measured,
    standings: Option<&Standings>,
    entries: &BTreeMap<String, bool>,
    engine: Engine,
    solver: &S,
) -> Result<Painted, String> {
    let inline = engine == Engine::Track;
    let graph = graph::compound_graph(content, measured, standings, entries, inline);
    let placed = choosing::placed_blocks(solver, &graph, inline).await?;
    let drawing = page::fitted_page(drawn::drawing_of(content, measured, &placed));
    let frozen = placed.planned;
    let bridged = if frozen {
        bridge_planned(&drawing, &measured.lines)
    } else {
        bridge_crossings(&drawing, &measured.lines)
    };
    Ok(PaintedDrawing {
        drawing,
        bridged,
        frozen,
    })
}

/// Whether one box lies inside another.
fn inside(inner: Rect, outer: Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
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
    // A region stays while it gathers something still drawn.
    let regions = whole.regions.as_ref().map(|regions| {
        regions
            .iter()
            .filter(|region| {
                cards
                    .iter()
                    .chain(&containers)
                    .any(|node| inside(node.bounds, region.bounds))
            })
            .cloned()
            .collect()
    });
    let kept: ArchitectureDrawing<NodeFacts, EdgeFacts> = ArchitectureDrawing {
        cards,
        containers,
        edges: whole
            .edges
            .iter()
            .filter(|edge| shown(&edge.edge.id))
            .cloned()
            .collect(),
        regions,
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
    let bridge = if drawing.frozen {
        bridge_planned
    } else {
        bridge_unfolded
    };
    let bridged = bridge(
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
