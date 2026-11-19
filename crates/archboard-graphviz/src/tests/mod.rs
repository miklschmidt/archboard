//! Graphviz in the core, held to what Graphviz answered before: viz-js, and the
//! answers of the critical graphs before graphviz-pure was made faster.

mod critical_graphs;
mod viz_js;

/// The full answer Graphviz gives a viz-js `Graph` object, given as JSON, with
/// `dot`: the viz-js oracle, where the layout reads geometry alone.
fn render(graph: &str) -> Result<String, String> {
    super::render_as(graph, false)
}
