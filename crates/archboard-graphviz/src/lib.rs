//! The layout's Graphviz, run in the core (ADR 0058): the vendored
//! graphviz-pure, a pure-Rust port of Graphviz 16.1.0 that sorts as musl's
//! `qsort` does (`crates/vendor/README.md`), lays out each graph a solve ranks.
//!
//! The layout hands Graphviz a viz-js `Graph` object as JSON, and reads what
//! viz-js 3 answered of it: its `json0` output, y inverted. viz-js does not
//! write that object as DOT. It builds the graph with cgraph calls
//! (`src/wrapper.js` and `backend/viz.c` of viz-js), and its default
//! attributes are not DOT's: each is set on every object of the graph that has
//! no value for it yet, and a graph's defaults reach only the graph and its
//! direct subgraphs. `cgraph` replays those calls, and `dot` states every
//! object's final value, to graphviz-pure's parser actions or as DOT text, so
//! the parser's own rules for defaults spread no value further than viz-js
//! did. Graphviz then lays out the graph viz-js built.
//!
//! An answer depends on its graph alone: graphviz-pure keeps no state from
//! one call to the next that changes what it answers (ADR 0058).

mod cgraph;
mod dot;
#[cfg(any(target_arch = "wasm32", test))]
mod fma;
mod graph;

/// Graphviz in the core: each graph laid out by `dot` and answered as its
/// `json0` output, y inverted, as viz-js answered it.
#[derive(Clone, Copy, Debug, Default)]
pub struct InCore;

impl archboard_layout::Graphviz for InCore {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        render(graph)
    }
}

/// Lay out a viz-js `Graph` object, given as JSON, with `dot`.
///
/// # Errors
///
/// A graph that does not read, or what Graphviz refused it with.
pub fn render(graph: &str) -> Result<String, String> {
    // A JSON string without a backslash escapes nothing, so no name or value
    // holds a quote, a backslash, a line break or a NUL, which DOT's quoted
    // strings would carry otherwise. Without those, and without the characters
    // graphviz-pure's charset stands for raw bytes with, the parser makes the
    // same graph of the statements as of their DOT text, so the text is skipped.
    let plain = !graph.contains('\\') && !graph.chars().any(|c| c >= '\u{10FF00}');
    let graph: graph::Graph = serde_json::from_str(graph).map_err(|error| error.to_string())?;
    let built = cgraph::Built::of(&graph);
    // `Y_invert` is a setting of the thread, as `dot -y` sets it for a run.
    // Every call sets it, so no call answers by what another set.
    graphviz_pure::set_y_invert(true);
    let answer = if plain {
        let mut statements = graphviz_pure::Statements::new(true);
        dot::write(&graph, &built, &mut statements);
        graphviz_pure::render_made(statements.finish(), "dot", "json0")
    } else {
        graphviz_pure::render_dot(&dot::of(&graph, &built), "dot", "json0")
    };
    answer.map_err(|error| error.to_string())
}
