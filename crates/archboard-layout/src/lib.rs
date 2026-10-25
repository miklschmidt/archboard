//! The renderer core's layout of architecture boards (ADR 0057): the solve a
//! Track board's measured graph goes in to and comes out of laid out. The host
//! gives it Graphviz ([`Graphviz`]); everything else it works out itself.
//!
//! The layout was first written in TypeScript, and every solve answers what
//! that engine answered, to the bit: floating point in the same order, maps
//! read in the order they were filled, sorts as stable, and numbers spelt as
//! ECMAScript spells them (`ecma`, `json`).

mod blocks;
mod constants;
mod ecma;
mod geometry;
mod graph;
mod json;
mod placed;
mod track;
mod viz;

pub use blocks::place::lay_out_track;

/// Graphviz, as the host runs it: lay out one graph and answer its `json0`
/// output. The graph is a viz-js `Graph` object given as JSON, and the host
/// renders it with `{ yInvert: true, format: "json0" }`.
pub trait Graphviz {
    /// Lay a graph out.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the graph with.
    fn render(&mut self, graph: &str) -> Result<String, String>;
}
