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

use archboard_scene::drawing::{Painted, PaintedDrawing};
pub use content::{Content, Edge, Node};
pub use graph::Standings;
pub use measured::Measured;
use serde::{Deserialize, Serialize};
pub use solving::{Solver, Unsolved, lay_out_across};

use crate::routes::{bridge_crossings, bridge_unfolded};

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
