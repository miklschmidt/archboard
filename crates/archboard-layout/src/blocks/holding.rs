//! The invisible edges that hold a block's items where they belong (TASK-349):
//! a wrap's lowered cards down, and the items no line enters on the first rank.

use crate::geometry::Side;
use crate::lanes::grid::wrap_edges;
use crate::lanes::scene::Set;
use crate::lanes::score::anchored;
use crate::viz::{Attrs, Edge, Subgraph, Value};

use super::card_layout::{Arrangement, CardLayout};
use super::tree::header_of;

impl CardLayout<'_> {
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
            self.subgraphs.push(Subgraph {
                graph_attributes: Some(Attrs::of([("rank", Value::from("min"))])),
                nodes: Some(nodes),
                ..Subgraph::default()
            });
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
}
