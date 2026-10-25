//! The graph a block gives Graphviz, as viz-js reads it: a `Graph` object
//! whose attributes keep the order they were set in. The host builds
//! Graphviz's graph from it in that order, so it is spelt for the host as the
//! TypeScript engine spelt it, and Graphviz lays it out the same.

use crate::json::J;

/// An attribute's value.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    Num(f64),
    Str(String),
    Bool(bool),
}

impl Value {
    /// The value as JSON.
    fn json(&self) -> J {
        match self {
            Value::Num(value) => J::Num(*value),
            Value::Str(value) => J::Str(value.clone()),
            Value::Bool(value) => J::Bool(*value),
        }
    }

    /// Whether the value is truthy, as `if (value)` reads it.
    pub(crate) fn truthy(&self) -> bool {
        match self {
            Value::Num(value) => *value != 0.0 && !value.is_nan(),
            Value::Str(value) => !value.is_empty(),
            Value::Bool(value) => *value,
        }
    }

    /// The value as a number, as `Number(value)` reads it.
    pub(crate) fn number(&self) -> f64 {
        match self {
            Value::Num(value) => *value,
            Value::Str(value) => crate::ecma::number_of(value),
            Value::Bool(value) => f64::from(u8::from(*value)),
        }
    }
}

impl From<f64> for Value {
    fn from(value: f64) -> Value {
        Value::Num(value)
    }
}

impl From<&str> for Value {
    fn from(value: &str) -> Value {
        Value::Str(value.to_owned())
    }
}

impl From<String> for Value {
    fn from(value: String) -> Value {
        Value::Str(value)
    }
}

impl From<bool> for Value {
    fn from(value: bool) -> Value {
        Value::Bool(value)
    }
}

/// Attributes, in the order they were set.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Attrs(pub Vec<(&'static str, Value)>);

impl Attrs {
    /// Attributes from their pairs, in order.
    pub(crate) fn of<const N: usize>(pairs: [(&'static str, Value); N]) -> Attrs {
        let mut attrs = Attrs::default();
        for (key, value) in pairs {
            attrs.set(key, value);
        }
        attrs
    }

    /// Set one, where it stood if it was set before.
    pub(crate) fn set(&mut self, key: &'static str, value: impl Into<Value>) {
        let value = value.into();
        match self.0.iter_mut().find(|(one, _)| *one == key) {
            Some((_, old)) => *old = value,
            None => self.0.push((key, value)),
        }
    }

    /// One attribute.
    pub(crate) fn get(&self, key: &str) -> Option<&Value> {
        self.0
            .iter()
            .find(|(one, _)| *one == key)
            .map(|(_, value)| value)
    }

    /// The attributes as JSON.
    fn json(&self) -> J {
        J::Obj(
            self.0
                .iter()
                .map(|(key, value)| ((*key).to_owned(), value.json()))
                .collect(),
        )
    }
}

/// A node: its name and its attributes.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Node {
    pub name: String,
    pub attributes: Attrs,
}

/// An edge between two nodes, by name.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Edge {
    pub tail: String,
    pub head: String,
    pub attributes: Attrs,
}

impl Edge {
    /// An edge between two nodes.
    pub(crate) fn new(tail: impl Into<String>, head: impl Into<String>, attributes: Attrs) -> Edge {
        Edge {
            tail: tail.into(),
            head: head.into(),
            attributes,
        }
    }

    /// The edge as viz-js reads it.
    fn json(&self) -> J {
        J::obj([
            ("tail", J::str(&self.tail)),
            ("head", J::str(&self.head)),
            ("attributes", self.attributes.json()),
        ])
    }
}

impl Node {
    /// The node as viz-js reads it.
    fn json(&self) -> J {
        J::obj([
            ("name", J::str(&self.name)),
            ("attributes", self.attributes.json()),
        ])
    }
}

/// A subgraph: a cluster, or a rank of nodes held together.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Subgraph {
    pub name: Option<String>,
    pub graph_attributes: Option<Attrs>,
    pub nodes: Option<Vec<Node>>,
    pub edges: Option<Vec<Edge>>,
    pub subgraphs: Option<Vec<Subgraph>>,
}

impl Subgraph {
    /// The subgraph as viz-js reads it, with only the members it has.
    fn json(&self) -> J {
        let mut members = Vec::new();
        if let Some(name) = &self.name {
            members.push(("name".to_owned(), J::str(name)));
        }
        if let Some(attributes) = &self.graph_attributes {
            members.push(("graphAttributes".to_owned(), attributes.json()));
        }
        if let Some(nodes) = &self.nodes {
            members.push((
                "nodes".to_owned(),
                J::Arr(nodes.iter().map(Node::json).collect()),
            ));
        }
        if let Some(edges) = &self.edges {
            members.push((
                "edges".to_owned(),
                J::Arr(edges.iter().map(Edge::json).collect()),
            ));
        }
        if let Some(subgraphs) = &self.subgraphs {
            members.push((
                "subgraphs".to_owned(),
                J::Arr(subgraphs.iter().map(Subgraph::json).collect()),
            ));
        }
        J::Obj(members)
    }
}

/// A graph Graphviz lays out.
#[derive(Clone, Debug, Default, PartialEq)]
#[expect(
    clippy::struct_field_names,
    reason = "the fields are viz-js's graphAttributes, nodeAttributes and edgeAttributes"
)]
pub(crate) struct Graph {
    pub graph_attributes: Attrs,
    pub node_attributes: Attrs,
    pub edge_attributes: Attrs,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub subgraphs: Vec<Subgraph>,
}

impl Graph {
    /// The graph as viz-js reads it, spelt as JSON.
    pub(crate) fn text(&self) -> String {
        J::obj([
            ("directed", J::Bool(true)),
            ("graphAttributes", self.graph_attributes.json()),
            ("nodeAttributes", self.node_attributes.json()),
            ("edgeAttributes", self.edge_attributes.json()),
            ("nodes", J::Arr(self.nodes.iter().map(Node::json).collect())),
            ("edges", J::Arr(self.edges.iter().map(Edge::json).collect())),
            (
                "subgraphs",
                J::Arr(self.subgraphs.iter().map(Subgraph::json).collect()),
            ),
        ])
        .text()
    }
}

/// Every node in a graph and all its subgraphs.
pub(crate) fn nodes_in<'a>(nodes: &'a [Node], subgraphs: &'a [Subgraph]) -> Vec<&'a Node> {
    let mut all: Vec<&Node> = nodes.iter().collect();
    for subgraph in subgraphs {
        all.extend(nodes_in(
            subgraph.nodes.as_deref().unwrap_or(&[]),
            subgraph.subgraphs.as_deref().unwrap_or(&[]),
        ));
    }
    all
}

/// A fixed-size Graphviz box in its inch units, from its size in diagram points.
pub(crate) fn box_node(name: impl Into<String>, width: f64, height: f64) -> Node {
    Node {
        name: name.into(),
        attributes: Attrs::of([
            ("width", Value::Num(width / 72.0)),
            ("height", Value::Num(height / 72.0)),
        ]),
    }
}
