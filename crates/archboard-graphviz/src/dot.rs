//! The DOT of the graph viz-js builds: every name declared at the root with
//! the value "", as `agsafeset` declares it; every node, edge and subgraph in
//! the order viz-js made it, so cgraph gives each object the same place; and
//! every value an object ends up with stated on that object.

use crate::cgraph::{Built, Kind, Values};
use crate::graph::Graph;

/// The DOT of a graph and of what viz-js builds of it.
pub(crate) fn of(graph: &Graph, built: &Built) -> String {
    let mut out = String::from("digraph {\n");
    declarations(&mut out, built);
    let mut made = Made::default();
    body(&mut out, graph, built, &mut made);
    for (name, values) in &built.nodes {
        if any_set(values) {
            quoted(&mut out, name);
            list(&mut out, values);
            out.push_str(";\n");
        }
    }
    statements(&mut out, built.values_of(0));
    out.push_str("}\n");
    out
}

/// How far the writing has come through the edges and subgraphs viz-js made.
#[derive(Debug, Default)]
struct Made {
    edges: usize,
    subgraphs: usize,
}

/// `graph`, `node` and `edge` statements that declare every name with "".
fn declarations(out: &mut String, built: &Built) {
    for (word, kind) in [
        ("graph", Kind::Graph),
        ("node", Kind::Node),
        ("edge", Kind::Edge),
    ] {
        let names = &built.declared[kind as usize];
        if names.is_empty() {
            continue;
        }
        out.push_str(word);
        out.push_str(" [");
        for (index, name) in names.iter().enumerate() {
            if index > 0 {
                out.push_str(", ");
            }
            quoted(out, name);
            out.push_str("=\"\"");
        }
        out.push_str("];\n");
    }
}

/// One graph's nodes, edges and subgraphs, in the order viz-js made them.
fn body(out: &mut String, graph: &Graph, built: &Built, made: &mut Made) {
    for node in &graph.nodes {
        quoted(out, &node.name);
        out.push_str(";\n");
    }
    for edge in &graph.edges {
        quoted(out, &edge.tail);
        out.push_str(" -> ");
        quoted(out, &edge.head);
        list(out, &built.edges[made.edges]);
        made.edges += 1;
        out.push_str(";\n");
    }
    for subgraph in &graph.subgraphs {
        let index = built.subgraphs[made.subgraphs];
        made.subgraphs += 1;
        out.push_str("subgraph ");
        if let Some(name) = &subgraph.name {
            quoted(out, name);
            out.push(' ');
        }
        out.push_str("{\n");
        body(out, subgraph, built, made);
        statements(out, built.values_of(index));
        out.push_str("}\n");
    }
}

/// Whether an object holds a value other than "".
fn any_set(values: &Values) -> bool {
    values.0.iter().any(|(_, value)| !value.is_empty())
}

/// An object's values other than "", as an attribute list.
fn list(out: &mut String, values: &Values) {
    if !any_set(values) {
        return;
    }
    out.push_str(" [");
    let set = values.0.iter().filter(|(_, value)| !value.is_empty());
    for (index, (name, value)) in set.enumerate() {
        if index > 0 {
            out.push_str(", ");
        }
        quoted(out, name);
        out.push('=');
        quoted(out, value);
    }
    out.push(']');
}

/// A graph's values other than "", each as a statement of its own.
fn statements(out: &mut String, values: &Values) {
    for (name, value) in &values.0 {
        if !value.is_empty() {
            quoted(out, name);
            out.push('=');
            quoted(out, value);
            out.push_str(";\n");
        }
    }
}

/// A DOT string of a value: a quote inside is escaped, and nothing else is.
fn quoted(out: &mut String, text: &str) {
    out.push('"');
    for character in text.chars() {
        if character == '"' {
            out.push('\\');
        }
        out.push(character);
    }
    out.push('"');
}
