//! The renderer core's layout of architecture boards (ADR 0057): a board's
//! parts and relationships, measured, drawn by Track or Blocks ([`draw`]). A
//! drawing is chosen between the solves of one board, each a measured graph
//! laid out one way ([`lay_out_board`]) and read for what the choice weighs;
//! the host runs the solves ([`Solver`]), side by side where it can, and each
//! solve lays out its graphs with a [`Graphviz`]. The chosen drawing is put on
//! a page fitted to it, and its crossings are settled before the drawing is
//! returned.
//!
//! The layout was first written in TypeScript, and every solve answers what
//! that engine answered, to the bit: floating point in the same order, maps
//! read in the order they were filled, sorts as stable, and numbers spelt as
//! ECMAScript spells them (`ecma`, `json`).

mod architecture;
mod blocks;
mod constants;
mod ecma;
mod geometry;
mod graph;
mod json;
mod placed;
mod routes;
mod track;
mod viz;

pub use architecture::{
    Calling, Content, Edge, Engine, InProcess, Laying, Measured, MeasuredGroups, Node, Solver,
    Standings, Unsolved, draw, shown_drawing,
};
pub use blocks::choosing::pair_crossings;
pub use blocks::place::lay_out_board;
pub use routes::LineLook;

/// Graphviz: lay out one graph and answer its `json0` output, y inverted. The
/// graph is a viz-js `Graph` object given as JSON, and the answer is what
/// viz-js renders of it with `{ yInvert: true, format: "json0" }`. The core's
/// is `archboard_graphviz::InCore` (ADR 0058).
pub trait Graphviz {
    /// Lay a graph out.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the graph with.
    fn render(&mut self, graph: &str) -> Result<String, String>;
}
