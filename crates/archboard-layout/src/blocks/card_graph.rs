//! A block of cards as a Graphviz graph (TASK-349): its items, header, ports
//! and stubs as nodes, its clusters as subgraphs, and every line through its
//! label's box, the first rank and the last held by invisible edges.

use crate::geometry::Side;
use crate::graph::FROM_POINTS;
use crate::track::grid::grid_edges;
use crate::track::scene::Set;
use crate::viz::{Attrs, Edge, Graph, Subgraph, Value, box_node};

use super::card_layout::{CardLayout, Sub};
use super::clusters::{Link, title_of};
use super::leaves::PORT;
use super::tree::{Line, header_of};
use super::walls::{enters_by, labelled_out};

impl CardLayout<'_> {
    /// Build the block's Graphviz graph: its items, its header and top ports
    /// alone on the first rank with the header leftmost, its bottom ports alone
    /// on the last, and every line through its label's box.
    pub(super) fn build(&mut self) {
        let block = self.block;
        for item in &block.items {
            let node = self.node_of(item);
            self.push(self.clusters.holder_of(item), node);
        }
        let header: Vec<String> = block
            .header
            .as_ref()
            .map(|_| header_of(block))
            .into_iter()
            .collect();
        self.rank_ends(&header);
        // Ranked across clusters, an outermost title held by nothing shared the
        // header's rank, and a region's caption stood over its containers' titles.
        for cluster in block
            .clusters
            .values()
            .filter(|cluster| cluster.parent.is_none())
        {
            for tail in &header {
                self.edges.push(Edge::new(
                    tail.clone(),
                    title_of(&cluster.id),
                    Attrs::of([("style", Value::from("invis"))]),
                ));
            }
        }
        self.add_stubs();
        let links = self.links();
        let ordered = self.clusters.board_order(|end| self.vendor_of(end));
        for line in ordered {
            self.connect(line);
        }
        self.arrange(&links);
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
                self.subgraphs.push(Sub::Plain(subgraph));
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
            .filter(|port| block.ports.get(port.as_str()) == Some(&face))
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

    /// Hold the block's items where its clusters, a grid, a wrap or an
    /// interface put them: titles above their members, loose cards in a grid,
    /// a wrapped item a row of cards and its labels lower per row, hidden parts
    /// below entry points.
    fn arrange(&mut self, links: &[Link]) {
        let grid: Vec<Edge> = if self.arranged.grid {
            self.loose_cards()
                .iter()
                .flat_map(|cards| grid_edges(cards))
                .collect()
        } else {
            Vec::new()
        };
        let lower: Set<String> = grid.iter().map(|edge| edge.head.clone()).collect();
        let titles = self.clusters.title_edges(&lower, links);
        let entering = self.clusters.entering_edges(links);
        let holds = self.wrap_holds();
        self.edges.extend(grid);
        self.edges.extend(titles);
        self.edges.extend(entering);
        self.edges.extend(holds);
        let entries = self.entry_row_edges();
        self.edges.extend(entries);
        self.hold_sources();
        self.hold_sinks();
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
        let weight = self.clusters.weight_of(&tail, &head);
        let leaves = line
            .edge
            .option(FROM_POINTS)
            .filter(|_| tail == line.edge.source());
        let leg = |id: String| {
            let mut attributes = Attrs::of([
                ("id", Value::from(id)),
                ("minlen", Value::Num(minlen)),
                ("weight", Value::Num(weight)),
            ]);
            if let Some(point) = leaves {
                attributes.set("tailport", point);
            }
            attributes
        };
        let Some(label) = label else {
            let attributes = leg(id.clone());
            self.edges.push(Edge::new(tail, head, attributes));
            return;
        };
        let name = format!("label:{}", line.edge.id);
        let down = weight + self.clusters.leaving_pull(&tail, &head);
        let (holder, holds) = self.clusters.hold_label(&tail, &head, &name);
        let node = box_node(
            name.as_str(),
            label.width.unwrap_or(f64::NAN),
            label.height.unwrap_or(f64::NAN),
        );
        self.push(holder, node);
        self.edges.extend(holds);
        let attributes = leg(format!("{id}:1"));
        self.edges.push(Edge::new(tail, name.clone(), attributes));
        let attributes = Attrs::of([
            ("id", Value::from(format!("{id}:2"))),
            ("weight", Value::Num(down)),
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
            subgraphs: self
                .subgraphs
                .iter()
                .map(|sub| match sub {
                    Sub::Cluster(index) => self.cluster_graph(*index),
                    Sub::Plain(subgraph) => subgraph.clone(),
                })
                .collect(),
        }
    }

    /// One cluster as a Graphviz subgraph, with the clusters inside it.
    fn cluster_graph(&self, index: usize) -> Subgraph {
        let cluster = &self.clusters.graphs[index];
        Subgraph {
            name: Some(cluster.name.clone()),
            graph_attributes: Some(Attrs::of([("margin", Value::Num(cluster.margin))])),
            nodes: Some(cluster.nodes.clone()),
            edges: None,
            subgraphs: Some(
                cluster
                    .subgraphs
                    .iter()
                    .map(|&inner| self.cluster_graph(inner))
                    .collect(),
            ),
        }
    }
}
