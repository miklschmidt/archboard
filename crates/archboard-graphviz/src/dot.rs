//! The DOT of the graph viz-js builds: every name declared at the root with
//! the value "", as `agsafeset` declares it; every node, edge and subgraph in
//! the order viz-js made it, so cgraph gives each object the same place; and
//! every value an object ends up with stated on that object.
//!
//! The statements go to a [`Sink`]: as DOT text, or straight to graphviz-pure's
//! parser actions ([`graphviz_pure::Statements`]), which make of them the graph
//! it would read from that text.

use graphviz_pure::{AttrKind, Statements};

use crate::cgraph::{Built, Kind, Values};
use crate::graph::Graph;

/// Where the statements of a graph go, one by one.
pub(crate) trait Sink {
    /// `graph [k=v, ...];`, `node [...]` or `edge [...]`.
    fn attributes(&mut self, kind: AttrKind, items: &[(&str, &str)]);
    /// `"name" [k=v, ...];`, without a list when `items` is empty.
    fn node(&mut self, name: &str, items: &[(&str, &str)]);
    /// `"tail" -> "head" [k=v, ...];`, without a list when `items` is empty.
    fn edge(&mut self, tail: &str, head: &str, items: &[(&str, &str)]);
    /// `subgraph "name" {` or `subgraph {`.
    fn open_subgraph(&mut self, name: Option<&str>);
    /// The subgraph's `}`.
    fn close_subgraph(&mut self);
    /// `"k"="v";`
    fn graph_attribute(&mut self, key: &str, value: &str);
}

/// The DOT of a graph and of what viz-js builds of it.
pub(crate) fn of(graph: &Graph, built: &Built) -> String {
    let mut text = Text(String::from("digraph {\n"));
    write(graph, built, &mut text);
    text.0.push_str("}\n");
    text.0
}

/// The statements of a graph and of what viz-js builds of it.
pub(crate) fn write(graph: &Graph, built: &Built, sink: &mut impl Sink) {
    declarations(sink, built);
    let mut made = Made::default();
    body(sink, graph, built, &mut made);
    for (name, values) in &built.nodes {
        let set = set(values);
        if !set.is_empty() {
            sink.node(name, &set);
        }
    }
    statements(sink, built.values_of(0));
}

/// How far the writing has come through the edges and subgraphs viz-js made.
#[derive(Debug, Default)]
struct Made {
    edges: usize,
    subgraphs: usize,
}

/// `graph`, `node` and `edge` statements that declare every name with "".
fn declarations(sink: &mut impl Sink, built: &Built) {
    for (word, kind) in [
        (AttrKind::Graph, Kind::Graph),
        (AttrKind::Node, Kind::Node),
        (AttrKind::Edge, Kind::Edge),
    ] {
        let names = &built.declared[kind as usize];
        if names.is_empty() {
            continue;
        }
        let items: Vec<(&str, &str)> = names.iter().map(|name| (name.as_str(), "")).collect();
        sink.attributes(word, &items);
    }
}

/// One graph's nodes, edges and subgraphs, in the order viz-js made them.
fn body(sink: &mut impl Sink, graph: &Graph, built: &Built, made: &mut Made) {
    for node in &graph.nodes {
        sink.node(&node.name, &[]);
    }
    for edge in &graph.edges {
        sink.edge(&edge.tail, &edge.head, &set(&built.edges[made.edges]));
        made.edges += 1;
    }
    for subgraph in &graph.subgraphs {
        let index = built.subgraphs[made.subgraphs];
        made.subgraphs += 1;
        sink.open_subgraph(subgraph.name.as_deref());
        body(sink, subgraph, built, made);
        statements(sink, built.values_of(index));
        sink.close_subgraph();
    }
}

/// An object's values other than "", in the order they were set.
fn set(values: &Values) -> Vec<(&str, &str)> {
    values
        .0
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect()
}

/// A graph's values other than "", each as a statement of its own.
fn statements(sink: &mut impl Sink, values: &Values) {
    for (name, value) in set(values) {
        sink.graph_attribute(name, value);
    }
}

/// The statements as DOT text.
struct Text(String);

impl Text {
    /// A DOT string of a value: a quote inside is escaped, and nothing else is.
    fn quoted(&mut self, text: &str) {
        self.0.push('"');
        for character in text.chars() {
            if character == '"' {
                self.0.push('\\');
            }
            self.0.push(character);
        }
        self.0.push('"');
    }

    /// ` [k=v, ...]`, or nothing for no items.
    fn list(&mut self, items: &[(&str, &str)]) {
        if items.is_empty() {
            return;
        }
        self.0.push_str(" [");
        for (index, (name, value)) in items.iter().enumerate() {
            if index > 0 {
                self.0.push_str(", ");
            }
            self.quoted(name);
            self.0.push('=');
            self.quoted(value);
        }
        self.0.push(']');
    }
}

impl Sink for Text {
    fn attributes(&mut self, kind: AttrKind, items: &[(&str, &str)]) {
        self.0.push_str(match kind {
            AttrKind::Graph => "graph",
            AttrKind::Node => "node",
            AttrKind::Edge => "edge",
        });
        self.list(items);
        self.0.push_str(";\n");
    }

    fn node(&mut self, name: &str, items: &[(&str, &str)]) {
        self.quoted(name);
        self.list(items);
        self.0.push_str(";\n");
    }

    fn edge(&mut self, tail: &str, head: &str, items: &[(&str, &str)]) {
        self.quoted(tail);
        self.0.push_str(" -> ");
        self.quoted(head);
        self.list(items);
        self.0.push_str(";\n");
    }

    fn open_subgraph(&mut self, name: Option<&str>) {
        self.0.push_str("subgraph ");
        if let Some(name) = name {
            self.quoted(name);
            self.0.push(' ');
        }
        self.0.push_str("{\n");
    }

    fn close_subgraph(&mut self) {
        self.0.push_str("}\n");
    }

    fn graph_attribute(&mut self, key: &str, value: &str) {
        self.quoted(key);
        self.0.push('=');
        self.quoted(value);
        self.0.push_str(";\n");
    }
}

impl Sink for Statements {
    fn attributes(&mut self, kind: AttrKind, items: &[(&str, &str)]) {
        Statements::attributes(self, kind, items);
    }

    fn node(&mut self, name: &str, items: &[(&str, &str)]) {
        Statements::node(self, name, items);
    }

    fn edge(&mut self, tail: &str, head: &str, items: &[(&str, &str)]) {
        Statements::edge(self, tail, head, items);
    }

    fn open_subgraph(&mut self, name: Option<&str>) {
        Statements::open_subgraph(self, name);
    }

    fn close_subgraph(&mut self) {
        Statements::close_subgraph(self);
    }

    fn graph_attribute(&mut self, key: &str, value: &str) {
        Statements::graph_attribute(self, key, value);
    }
}

#[cfg(test)]
mod tests {
    use super::{Statements, of, write};
    use crate::cgraph::Built;
    use crate::graph::Graph;

    /// A graph with what the layout writes: defaults of every kind, a node
    /// named twice, a name reused by a nested subgraph, anonymous and named
    /// subgraphs, and values set on nodes, edges and subgraphs.
    const GRAPH: &str = r#"{
        "graphAttributes": {"rankdir": "TB", "nodesep": 0.5, "newrank": true},
        "nodeAttributes": {"shape": "box", "label": ""},
        "edgeAttributes": {"dir": "none"},
        "nodes": [{"name": "a", "attributes": {"width": 1.5}}, {"name": "b"}],
        "edges": [{"tail": "a", "head": "c", "attributes": {"id": "e1", "weight": 2}}],
        "subgraphs": [
            {"name": "cluster_x", "graphAttributes": {"label": "", "margin": 8},
             "nodes": [{"name": "b"}, {"name": "d", "attributes": {"height": 0.5}}],
             "edges": [{"tail": "d", "head": "b"}],
             "subgraphs": [{"name": "cluster_x", "nodeAttributes": {"group": "g"},
                            "nodes": [{"name": "e"}]}]},
            {"graphAttributes": {"rank": "same"}, "nodes": [{"name": "a"}, {"name": "c"}]}
        ]
    }"#;

    #[test]
    fn the_statements_make_the_graph_their_dot_text_reads_as() {
        let graph: Graph = serde_json::from_str(GRAPH).expect("the graph reads");
        let built = Built::of(&graph);
        let mut statements = Statements::new(true);
        write(&graph, &built, &mut statements);
        let read = graphviz_pure::parse_dot(&of(&graph, &built)).expect("the DOT reads");
        assert_eq!(statements.finish(), read);
    }
}
