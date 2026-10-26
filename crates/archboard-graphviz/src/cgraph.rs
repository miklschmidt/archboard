//! The cgraph graph viz-js builds of a `Graph` object, as far as what it holds
//! decides: which objects there are, in which order they were made, and the
//! value each holds of each attribute.
//!
//! viz-js reads a graph (`readGraph` in `src/wrapper.js`): its nodes, its
//! edges, each subgraph in turn, and then the graph's defaults. It sets an
//! object's own attribute with `agsafeset`, which declares the name for every
//! object of that kind with the value "". A default is set on each object that
//! has none yet (`add_attribute` in `backend/viz.c`): a graph default on the
//! graph and its direct subgraphs, a node or edge default on every node or
//! edge the graph holds.

use std::collections::HashMap;

use crate::graph::{Attributes, Graph};

/// One object's values, in the order they were first set.
#[derive(Debug, Default)]
pub(crate) struct Values(pub(crate) Vec<(String, String)>);

impl Values {
    /// The value set, or none.
    fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    /// Set a value, where it stood if it was set before.
    fn set(&mut self, name: &str, value: &str) {
        match self.0.iter_mut().find(|(key, _)| key == name) {
            Some((_, old)) => value.clone_into(old),
            None => self.0.push((name.to_owned(), value.to_owned())),
        }
    }
}

/// The kinds of cgraph object, each with its own declared attributes.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Kind {
    Graph = 0,
    Node = 1,
    Edge = 2,
}

/// One object of the graph.
#[derive(Clone, Copy, Debug)]
enum Object {
    Graph(usize),
    Node(usize),
    Edge(usize),
}

impl Object {
    fn kind(self) -> Kind {
        match self {
            Object::Graph(_) => Kind::Graph,
            Object::Node(_) => Kind::Node,
            Object::Edge(_) => Kind::Edge,
        }
    }
}

/// A graph or subgraph, and what it holds.
#[derive(Debug, Default)]
pub(crate) struct Held {
    name: Option<String>,
    parent: Option<usize>,
    children: Vec<usize>,
    nodes: Vec<usize>,
    edges: Vec<usize>,
    pub(crate) values: Values,
}

/// The graph viz-js builds: its root is graph 0.
#[derive(Debug)]
pub(crate) struct Built {
    graphs: Vec<Held>,
    node_names: HashMap<String, usize>,
    /// Each node's name and values, in the order the nodes were made.
    pub(crate) nodes: Vec<(String, Values)>,
    /// Each edge's values, in the order the edges were made.
    pub(crate) edges: Vec<Values>,
    /// The attribute names declared, per kind, in the order they were declared.
    pub(crate) declared: [Vec<String>; 3],
    /// The graph each subgraph object of the data became, in the order they were read.
    pub(crate) subgraphs: Vec<usize>,
}

impl Built {
    /// The graph viz-js builds of a `Graph` object.
    pub(crate) fn of(graph: &Graph) -> Built {
        let mut built = Built {
            graphs: vec![Held::default()],
            node_names: HashMap::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            declared: [Vec::new(), Vec::new(), Vec::new()],
            subgraphs: Vec::new(),
        };
        built.read(0, graph);
        built
    }

    /// A graph or subgraph's values.
    pub(crate) fn values_of(&self, graph: usize) -> &Values {
        &self.graphs[graph].values
    }

    /// `readGraph`.
    fn read(&mut self, at: usize, graph: &Graph) {
        for node in &graph.nodes {
            let index = self.node(at, &node.name);
            self.set_all(Object::Node(index), &node.attributes);
        }
        for edge in &graph.edges {
            let index = self.edge(at, &edge.tail, &edge.head);
            self.set_all(Object::Edge(index), &edge.attributes);
        }
        for subgraph in &graph.subgraphs {
            let index = self.subgraph(at, subgraph.name.as_deref());
            self.subgraphs.push(index);
            self.read(index, subgraph);
        }
        self.defaults(at, graph);
    }

    /// `setAttributes`: each attribute set on the object.
    fn set_all(&mut self, object: Object, attributes: &Attributes) {
        for (name, value) in &attributes.0 {
            self.safeset(object, name, value);
        }
    }

    /// `setDefaultAttributes`, with viz.c's `viz_set_default_*_attribute`.
    fn defaults(&mut self, at: usize, graph: &Graph) {
        let held = &self.graphs[at];
        let graphs: Vec<Object> = std::iter::once(at)
            .chain(held.children.iter().copied())
            .map(Object::Graph)
            .collect();
        let nodes: Vec<Object> = held.nodes.iter().copied().map(Object::Node).collect();
        let edges: Vec<Object> = held.edges.iter().copied().map(Object::Edge).collect();
        for (attributes, objects) in [
            (&graph.graph_attributes, graphs),
            (&graph.node_attributes, nodes),
            (&graph.edge_attributes, edges),
        ] {
            for (name, value) in &attributes.0 {
                for &object in &objects {
                    self.add_attribute(object, name, value);
                }
            }
        }
    }

    /// `agnode(g, name, true)`: the node of that name, made if there is none,
    /// held by the graph and every graph above it.
    fn node(&mut self, at: usize, name: &str) -> usize {
        let node = if let Some(&node) = self.node_names.get(name) {
            node
        } else {
            self.node_names.insert(name.to_owned(), self.nodes.len());
            self.nodes.push((name.to_owned(), Values::default()));
            self.nodes.len() - 1
        };
        let mut graph = Some(at);
        while let Some(index) = graph {
            if !self.graphs[index].nodes.contains(&node) {
                self.graphs[index].nodes.push(node);
            }
            graph = self.graphs[index].parent;
        }
        node
    }

    /// `agedge(g, agnode(g, tail), agnode(g, head), NULL, true)`, in a graph
    /// that is not strict: always a new edge, held by every graph above it too.
    fn edge(&mut self, at: usize, tail: &str, head: &str) -> usize {
        self.node(at, tail);
        self.node(at, head);
        let edge = self.edges.len();
        self.edges.push(Values::default());
        let mut graph = Some(at);
        while let Some(index) = graph {
            self.graphs[index].edges.push(edge);
            graph = self.graphs[index].parent;
        }
        edge
    }

    /// `agsubg(g, name, true)`: a named subgraph is found again by its name,
    /// and a subgraph without one is always new.
    fn subgraph(&mut self, at: usize, name: Option<&str>) -> usize {
        let found = name.and_then(|name| {
            self.graphs[at]
                .children
                .iter()
                .copied()
                .find(|&child| self.graphs[child].name.as_deref() == Some(name))
        });
        found.unwrap_or_else(|| {
            self.graphs.push(Held {
                name: name.map(str::to_owned),
                parent: Some(at),
                ..Held::default()
            });
            let index = self.graphs.len() - 1;
            self.graphs[at].children.push(index);
            index
        })
    }

    /// An object's values.
    fn values(&mut self, object: Object) -> &mut Values {
        match object {
            Object::Graph(index) => &mut self.graphs[index].values,
            Object::Node(index) => &mut self.nodes[index].1,
            Object::Edge(index) => &mut self.edges[index],
        }
    }

    /// `agsafeset(object, name, value, "")`: the name declared for its kind,
    /// and the value set.
    fn safeset(&mut self, object: Object, name: &str, value: &str) {
        let declared = &mut self.declared[object.kind() as usize];
        if !declared.iter().any(|one| one == name) {
            declared.push(name.to_owned());
        }
        self.values(object).set(name, value);
    }

    /// viz.c's `add_attribute`: the value set where `agget` answers none
    /// (the name undeclared) or "".
    fn add_attribute(&mut self, object: Object, name: &str, value: &str) {
        if self.values(object).get(name).is_none_or(str::is_empty) {
            self.safeset(object, name, value);
        }
    }
}
