//! The invisible edges that hold a block's items where they belong (TASK-349):
//! a wrap's lowered cards down, a container's hidden parts below its first
//! entry points (ADR 0044), the items no line enters on the first rank and the
//! items no line leaves above the bottom ports.

use crate::geometry::Side;
use crate::track::grid::wrap_edges;
use crate::track::scene::{Map, Set};
use crate::track::score::anchored;
use crate::viz::{Attrs, Edge, Subgraph, Value};

use super::card_layout::{Arrangement, CardLayout, Sub};
use super::cycles::Below;
use super::tree::{ClusterKind, header_of};

impl<'t> CardLayout<'t> {
    /// The invisible edges that hold a wrap's lowered cards down: each under
    /// the card above it in its column when the rows keep their columns, and
    /// one no line or column reaches by the first card of the rank's first row.
    pub(super) fn wrap_holds(&self) -> Vec<Edge> {
        let Arrangement {
            lowered, columns, ..
        } = &self.arranged;
        let mut held = if *columns {
            wrap_edges(lowered)
        } else {
            Vec::new()
        };
        let mut arriving: Set<String> = self
            .block
            .lines
            .values()
            .map(|line| self.vendor_of(&line.head))
            .collect();
        for edge in &held {
            arriving.insert(edge.head.clone());
        }
        for (card, rows, anchor) in anchored(lowered, &arriving) {
            held.push(Edge::new(
                anchor,
                card,
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("minlen", Value::Num(2.0 * rows as f64)),
                    ("weight", Value::Num(0.0)),
                ]),
            ));
        }
        held
    }

    /// The invisible edges that stand each container's hidden parts below its
    /// first entry points (ADR 0044): the parts its callers reach take its
    /// first row, under its title, and what they hide sits beneath them.
    pub(super) fn entry_row_edges(&self) -> Vec<Edge> {
        let entries = &self.tree.entries;
        if !entries.values().any(|&first| first) {
            return Vec::new();
        }
        let mut below = Below::default();
        for edge in &self.edges {
            below.add(&edge.tail, &edge.head);
        }
        let mut edges = Vec::new();
        for members in self.parts_by_frame().values() {
            self.hold_hidden_parts(members, &mut below, &mut edges);
        }
        edges
    }

    /// The parts of each container: its cards and frames, by the frame around them.
    fn parts_by_frame(&self) -> Map<String, Vec<&'t str>> {
        let block = self.block;
        let is_part = |member: &str| {
            self.tree.cards.contains_key(member)
                || block
                    .clusters
                    .get(member)
                    .is_some_and(|cluster| cluster.kind == ClusterKind::Frame)
        };
        let mut parts: Map<String, Vec<&str>> = Map::default();
        for (member, around) in &block.cluster_of {
            if let Some(frame) = block.frame_around(Some(around))
                && is_part(member)
            {
                parts.entry(frame).or_default().push(member);
            }
        }
        parts
    }

    /// Stand a container's hidden parts below its first entry points, where
    /// nothing stands them so already.
    fn hold_hidden_parts(&self, members: &[&str], below: &mut Below, edges: &mut Vec<Edge>) {
        let entries = &self.tree.entries;
        let first: Vec<String> = members
            .iter()
            .filter(|&&one| entries.get(one) == Some(&true))
            .map(|one| self.clusters.vendor_of(one))
            .collect();
        let under: Set<String> = first.iter().flat_map(|entry| below.reach(entry)).collect();
        let hidden: Vec<String> = members
            .iter()
            .filter(|&&one| !entries.contains_key(one))
            .map(|one| self.clusters.vendor_of(one))
            .collect();
        for part in hidden.iter().filter(|part| !under.contains(*part)) {
            let above = below.reach(part);
            let held: Vec<&String> = first
                .iter()
                .filter(|entry| !above.contains(*entry))
                .collect();
            for entry in held {
                below.add(entry, part);
                edges.push(Edge::new(
                    entry.clone(),
                    part.clone(),
                    Attrs::of([("style", Value::from("invis")), ("weight", Value::Num(0.0))]),
                ));
            }
        }
    }

    /// Hold every item no line enters on a block's first rank of items, when
    /// the block has ports on its bottom: Graphviz ranks those ports last and
    /// joins every item no line leaves to them at no cost, so a short chain
    /// would hang from the bottom.
    pub(super) fn hold_sources(&mut self) {
        let block = self.block;
        if !block.has_bottom_port() {
            return;
        }
        let entered: Set<&str> = self.edges.iter().map(|edge| edge.head.as_str()).collect();
        let leaving: Set<&str> = self.edges.iter().map(|edge| edge.tail.as_str()).collect();
        let sources: Vec<String> = block
            .items
            .iter()
            .filter(|item| !entered.contains(item.as_str()) && leaving.contains(item.as_str()))
            .cloned()
            .collect();
        if sources.is_empty() {
            return;
        }
        let above = if block.header.is_some() {
            Some(header_of(block))
        } else {
            self.ports_on(Side::Top).into_iter().next()
        };
        let Some(above) = above else {
            let nodes = sources.iter().map(|source| self.node_of(source)).collect();
            self.subgraphs.push(Sub::Plain(Subgraph {
                graph_attributes: Some(Attrs::of([("rank", Value::from("min"))])),
                nodes: Some(nodes),
                ..Subgraph::default()
            }));
            return;
        };
        for head in sources {
            self.edges.push(Edge::new(
                above.clone(),
                head,
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("weight", Value::Num(1.0)),
                    ("minlen", Value::Num(1.0)),
                ]),
            ));
        }
    }

    /// Hold every item no line leaves above a block's bottom ports, when the
    /// block ranks across the clusters it draws inline: Graphviz's `newrank`
    /// ranking does not stand `rank=sink` ports alone on the last rank.
    pub(super) fn hold_sinks(&mut self) {
        let block = self.block;
        let Some(port) = self.ports_on(Side::Bottom).into_iter().next() else {
            return;
        };
        if block.clusters.is_empty() {
            return;
        }
        let leaving: Set<&str> = self.edges.iter().map(|edge| edge.tail.as_str()).collect();
        let sinks: Vec<String> = block
            .items
            .iter()
            .filter(|item| !leaving.contains(item.as_str()))
            .cloned()
            .collect();
        for tail in sinks {
            self.edges.push(Edge::new(
                tail,
                port.clone(),
                Attrs::of([
                    ("style", Value::from("invis")),
                    ("weight", Value::Num(0.0)),
                    ("minlen", Value::Num(1.0)),
                ]),
            ));
        }
    }
}
