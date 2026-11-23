//! A Lanes drawing's containers drawn inline (TASK-349): a card is an item of
//! its block, a container a cluster of that block with its children inside it,
//! and each node stands in its group's region, a cluster too. Graphviz then
//! ranks every card of the picture in one layout, and the lane router routes
//! every line in one scene, round and through each frame.

use crate::graph::Node;
use crate::viz::{Attrs, Edge, Value};

use super::card_layout::CardLayout;
use super::clusters::title_of;
use super::headers::Header;
use super::laid::Size;
use super::lone::{band_of, card_as, frame_header, placing_group};
use super::nested::by_order;
use super::tree::{Block, BlockId, BlockTree, Cluster, ClusterKind, holds};

impl BlockTree {
    /// Fill a block with nodes drawn inline, in the picture's order, each in its group's region.
    pub(super) fn fill_inline(&mut self, block: BlockId, nodes: &[Node]) -> Result<(), String> {
        let ordered = by_order(nodes);
        for node in &ordered {
            self.add_inline(block, node, None, &ordered)?;
        }
        Ok(())
    }

    /// Add one node to a block drawn inline: a card as an item, a container as
    /// a cluster with its children inside it, each in its group's region.
    fn add_inline(
        &mut self,
        block: BlockId,
        node: &Node,
        around: Option<String>,
        siblings: &[&Node],
    ) -> Result<(), String> {
        let group = placing_group(&mut self.lone, &self.captions, node, siblings);
        let within = match group {
            Some(group) if self.get(block).group.as_deref() != Some(group.as_str()) => {
                Some(self.inline_region(block, around, &group))
            }
            _ => around,
        };
        if let Some(within) = &within {
            self.get_mut(block)
                .cluster_of
                .insert(node.id.clone(), within.clone());
        }
        self.holder.insert(node.id.clone(), block);
        if node.has_children() {
            return self.add_frame(block, node, within);
        }
        self.get_mut(block).items.push(node.id.clone());
        let card = card_as(node, self.lone.get(&node.id));
        self.cards.insert(node.id.clone(), card);
        Ok(())
    }

    /// A group's region cluster inside a cluster of a block drawn inline, made on first use.
    fn inline_region(&mut self, block: BlockId, around: Option<String>, group: &str) -> String {
        let id = format!(
            "region:{}:{group}",
            around.as_deref().unwrap_or(&self.get(block).id)
        );
        if self.get(block).clusters.contains_key(&id) {
            return id;
        }
        let header = Header::of(self.captions.get(group).copied().unwrap_or(Size {
            width: 1.0,
            height: 1.0,
        }));
        let held = self.get_mut(block);
        held.clusters.insert(
            id.clone(),
            Cluster {
                id: id.clone(),
                kind: ClusterKind::Region,
                parent: around.clone(),
                group: Some(group.to_owned()),
                header,
                lone: None,
            },
        );
        if let Some(around) = around {
            held.cluster_of.insert(id.clone(), around);
        }
        id
    }

    /// Add a container to a block drawn inline: a cluster with its children inside it.
    fn add_frame(
        &mut self,
        block: BlockId,
        node: &Node,
        within: Option<String>,
    ) -> Result<(), String> {
        let lone = self.lone.get(&node.id).cloned();
        let header = frame_header(node, lone.as_ref().map_or(0.0, band_of))?;
        self.get_mut(block).clusters.insert(
            node.id.clone(),
            Cluster {
                id: node.id.clone(),
                kind: ClusterKind::Frame,
                parent: within,
                group: None,
                header,
                lone,
            },
        );
        let children = by_order(node.kids());
        for child in &children {
            self.add_inline(block, child, Some(node.id.clone()), &children)?;
        }
        Ok(())
    }
}

impl CardLayout<'_> {
    /// The invisible edges that stand a card outside a container drawn inline
    /// above it, over the container's title: a card that only calls into the
    /// container, and only the members on its first row, those no other member
    /// calls. Ranked freely, such a card stands beside the container on the
    /// rank of its partner, and its lines cross the frame sideways. Every other
    /// card ranks by its own lines: one the container calls stands beside the
    /// member that calls it.
    pub(super) fn sides_held(&self) -> Vec<Edge> {
        let block = self.block;
        if !self.tree.lanes {
            return Vec::new();
        }
        let mut held = Vec::new();
        for frame in block
            .clusters
            .values()
            .filter(|cluster| cluster.kind == ClusterKind::Frame && cluster.parent.is_none())
        {
            let members: Vec<&String> = block
                .items
                .iter()
                .filter(|item| holds(block, &frame.id, item))
                .collect();
            let first = first_row(block, &members);
            held.extend(
                block
                    .items
                    .iter()
                    .filter(|card| !block.cluster_of.contains_key(*card))
                    .filter(|card| calls_only(block, card, &members, &first))
                    .map(|card| {
                        Edge::new(
                            card.clone(),
                            title_of(&frame.id),
                            Attrs::of([
                                ("style", Value::from("invis")),
                                ("minlen", Value::Num(1.0)),
                            ]),
                        )
                    }),
            );
        }
        held
    }
}

/// The members on a container's first row: those no other member calls.
fn first_row<'b>(block: &'b Block, members: &[&'b String]) -> Vec<&'b String> {
    members
        .iter()
        .copied()
        .filter(|member| {
            !block
                .lines
                .values()
                .any(|line| line.to == **member && members.contains(&&line.from))
        })
        .collect()
}

/// Whether a card outside a container only calls into it, and only the members on its first row.
fn calls_only(block: &Block, card: &str, members: &[&String], first: &[&String]) -> bool {
    let into: Vec<&String> = block
        .lines
        .values()
        .filter(|line| line.from == card && members.contains(&&line.to))
        .map(|line| &line.to)
        .collect();
    let back = block
        .lines
        .values()
        .any(|line| line.to == card && members.contains(&&line.from));
    !into.is_empty() && !back && into.iter().all(|to| first.contains(to))
}
