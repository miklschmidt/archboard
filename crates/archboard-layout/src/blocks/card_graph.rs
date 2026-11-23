//! A block of cards as a Graphviz graph (TASK-349): its items, header, ports
//! and stubs as nodes, and every line through its label's box, the first rank
//! and the last held by invisible edges.

use crate::ecma::{or, sorted_by};
use crate::geometry::Side;
use crate::lanes::grid::grid_edges;
use crate::lanes::scene::{Map, Set};
use crate::viz::{Attrs, Edge, Graph, Node, Subgraph, Value, box_node};

use super::card_layout::CardLayout;
use super::leaves::PORT;
use super::tree::{Line, header_of};
use super::walls::{enters_by, labelled_out, ranks};

/// How strongly a line pulls its lower end.
const LINE_WEIGHT: f64 = 1.0;

impl<'t> CardLayout<'t> {
    /// Build the block's Graphviz graph: its items, its header and top ports
    /// alone on the first rank with the header leftmost, its bottom ports alone
    /// on the last, and every line through its label's box.
    pub(super) fn build(&mut self) {
        let block = self.block;
        for item in &block.items {
            let node = self.node_of(item);
            self.nodes.push(node);
        }
        let header: Vec<String> = block
            .header
            .as_ref()
            .map(|_| header_of(block))
            .into_iter()
            .collect();
        self.rank_ends(&header);
        self.add_stubs();
        for line in self.picture_order() {
            if !block.header_line(line) {
                self.connect(line);
            }
        }
        self.arrange();
    }

    /// Every line Graphviz ranks, by where its ends stand in the picture's order.
    fn picture_order(&self) -> Vec<&'t Line> {
        let block = self.block;
        let place: Map<String, f64> = block
            .items
            .iter()
            .enumerate()
            .map(|(index, item)| (item.clone(), index as f64))
            .collect();
        let placed: Vec<(&'t Line, f64, f64)> = block
            .lines
            .values()
            .filter(|line| ranks(block, line))
            .map(|line| {
                let at = |end: &str| place.get(&self.vendor_of(end)).copied().unwrap_or(-1.0);
                (line, at(&line.tail), at(&line.head))
            })
            .collect();
        sorted_by(&placed, |one, other| or(one.1 - other.1, one.2 - other.2))
            .into_iter()
            .map(|(line, _, _)| line)
            .collect()
    }

    /// The header and top ports alone on the first rank, the header leftmost,
    /// and the bottom ports alone on the last.
    fn rank_ends(&mut self, header: &[String]) {
        let (tops, bottoms) = (self.ports_on(Side::Top), self.ports_on(Side::Bottom));
        let invisible = || Attrs::of([("style", Value::from("invis"))]);
        let first = Subgraph {
            graph_attributes: Some(Attrs::of([("rank", Value::from("source"))])),
            nodes: Some(
                header
                    .iter()
                    .chain(&tops)
                    .map(|name| self.node_of(name))
                    .collect(),
            ),
            edges: Some(
                header
                    .iter()
                    .flat_map(|tail| {
                        tops.iter()
                            .map(move |head| Edge::new(tail.clone(), head.clone(), invisible()))
                    })
                    .chain(self.held_edges(Side::Top))
                    .collect(),
            ),
            ..Subgraph::default()
        };
        let last = Subgraph {
            graph_attributes: Some(Attrs::of([("rank", Value::from("sink"))])),
            nodes: Some(bottoms.iter().map(|name| self.node_of(name)).collect()),
            edges: Some(self.held_edges(Side::Bottom)),
            ..Subgraph::default()
        };
        for subgraph in [first, last] {
            if subgraph
                .nodes
                .as_ref()
                .is_some_and(|nodes| !nodes.is_empty())
            {
                self.subgraphs.push(subgraph);
            }
        }
    }

    /// The invisible edges that hold the ports on one face of the block in the
    /// order its parent settles them in (`orders.rs`), each port to the next.
    fn held_edges(&self, face: Side) -> Vec<Edge> {
        let block = self.block;
        let key = format!("{}|{}", block.id, face.name());
        let held: Vec<&String> = self
            .tree
            .orders
            .get(&key)
            .into_iter()
            .flatten()
            .filter(|port| {
                block.ports.get(port.as_str()) == Some(&face) && !block.header_entry(port)
            })
            .collect();
        held.windows(2)
            .map(|pair| {
                Edge::new(
                    pair[0].clone(),
                    pair[1].clone(),
                    Attrs::of([("style", Value::from("invis"))]),
                )
            })
            .collect()
    }

    /// A stub node for each line that enters the block through a port or
    /// leaves it by its label, at the end the block holds.
    fn add_stubs(&mut self) {
        let block = self.block;
        let mut stubs: Set<String> = Set::default();
        for line in block.lines.values() {
            if enters_by(block, line).is_some() {
                stubs.insert(self.vendor_of(&line.from));
            }
            if labelled_out(block, line).is_some() {
                stubs.insert(self.vendor_of(&line.to));
            }
        }
        self.nodes
            .extend(stubs.iter().map(|stub| box_node(stub.as_str(), PORT, PORT)));
    }

    /// Arrange loose cards in a grid, hold wrapped rows, and keep source items
    /// on the first rank when the block has bottom ports.
    fn arrange(&mut self) {
        let grid = if self.arranged.grid {
            grid_edges(&self.loose_cards())
        } else {
            Vec::new()
        };
        let holds = self.wrap_holds();
        self.edges.extend(grid);
        self.edges.extend(holds);
        self.hold_sources();
    }

    /// Connect one line, through its label's box when it carries the label here.
    fn connect(&mut self, line: &Line) {
        let tail = self.vendor_of(&line.tail);
        let head = self.vendor_of(&line.head);
        let label = if line.labelled {
            line.edge.label()
        } else {
            None
        };
        let id = &line.key;
        // A wrapped item sits a row of cards and its labels lower for each row it is lowered.
        let minlen = 1.0 + 2.0 * self.arranged.lowered.get(&head).copied().unwrap_or(0) as f64;
        let leg = |id: String| {
            Attrs::of([
                ("id", Value::from(id)),
                ("minlen", Value::Num(minlen)),
                ("weight", Value::Num(LINE_WEIGHT)),
            ])
        };
        let Some(label) = label else {
            let attributes = leg(id.clone());
            self.edges.push(Edge::new(tail, head, attributes));
            return;
        };
        let name = format!("label:{}", line.edge.id);
        let node = box_node(
            name.as_str(),
            label.width.unwrap_or(f64::NAN),
            label.height.unwrap_or(f64::NAN),
        );
        self.nodes.push(node);
        let attributes = leg(format!("{id}:1"));
        self.edges.push(Edge::new(tail, name.clone(), attributes));
        let attributes = Attrs::of([
            ("id", Value::from(format!("{id}:2"))),
            ("weight", Value::Num(LINE_WEIGHT)),
        ]);
        self.edges.push(Edge::new(name, head, attributes));
    }

    /// The block's Graphviz graph, as built.
    pub(super) fn graph(&self) -> Graph {
        Graph {
            graph_attributes: self.attrs.clone(),
            node_attributes: Attrs::of([
                ("shape", Value::from("box")),
                ("fixedsize", Value::Bool(true)),
                ("label", Value::from("")),
                ("margin", Value::Num(0.0)),
            ]),
            edge_attributes: Attrs::of([("dir", Value::from("none"))]),
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
            subgraphs: self.subgraphs.clone(),
        }
    }

    /// Keep the widths crowded cards need, for the next ranking. Widths only
    /// grow, and each card's ports bound them, so the rankings end.
    pub(super) fn reserve_ports(&mut self, widths: &Map<String, f64>) -> bool {
        let crowded: Vec<(String, f64)> = widths
            .iter()
            .filter(|&(name, &width)| {
                self.tree
                    .cards
                    .get(name.as_str())
                    .is_some_and(|card| self.tree.packed || !card.door)
                    && width > self.size_of(name).width
            })
            .map(|(name, &width)| (name.clone(), width))
            .collect();
        if crowded.is_empty() {
            return false;
        }
        self.port_widths.extend(crowded);
        let sized: Map<String, Node> = self
            .port_widths
            .keys()
            .map(|name| (name.clone(), self.node_of(name)))
            .collect();
        for node in &mut self.nodes {
            if let Some(Value::Num(width)) = sized
                .get(&node.name)
                .and_then(|wider| wider.attributes.get("width"))
            {
                node.attributes.set("width", Value::Num(*width));
            }
        }
        true
    }
}
