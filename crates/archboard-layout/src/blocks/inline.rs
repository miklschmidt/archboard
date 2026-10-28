//! How a block's nodes are drawn inline (TASK-349): a card as an item of its
//! block, a container as a cluster with its children inside it, and each node
//! in its group's region, a cluster of the block or, with groups packed, a
//! block of its own.

use crate::ecma::sorted_by;
use crate::graph::{ENTRY_POINT, Node, semantic_order};

use super::headers::Header;
use super::laid::{Size, tab_of};
use super::lone::{band_of, card_as, frame_header, placing_group};
use super::tree::{BlockId, BlockTree, Cluster, ClusterKind, Kind, Nesting};

impl BlockTree {
    /// Fill a block with nodes, in the board's order, each in its group's region.
    pub(super) fn fill(&mut self, block: BlockId, nodes: &[Node]) -> Result<(), String> {
        let ordered = by_order(nodes);
        for node in &ordered {
            self.add_inline(block, node, None, &ordered)?;
        }
        Ok(())
    }

    /// Add one node to a block drawn inline: a card as an item, a container as a
    /// cluster with its children inside it, each in its group's region; an entry
    /// point of its container is noted as one.
    fn add_inline(
        &mut self,
        block: BlockId,
        node: &Node,
        around: Option<String>,
        siblings: &[&Node],
    ) -> Result<(), String> {
        let group = placing_group(&mut self.lone, &self.captions, node, siblings);
        let (holder, within) = self.placing(block, around, group);
        if let Some(within) = &within {
            self.get_mut(holder)
                .cluster_of
                .insert(node.id.clone(), within.clone());
        }
        if let Some(entry) = node.option(ENTRY_POINT) {
            self.entries.insert(node.id.clone(), entry == "true");
        }
        self.holder.insert(node.id.clone(), holder);
        if node.has_children() {
            return self.add_frame(holder, node, within);
        }
        self.get_mut(holder).items.push(node.id.clone());
        let card = card_as(node, self.lone.get(&node.id));
        self.cards.insert(node.id.clone(), card);
        Ok(())
    }

    /// Where a node drawn inline goes: in its group's region, a cluster of the
    /// block or, with groups packed, a block of its own; else where it is.
    fn placing(
        &mut self,
        block: BlockId,
        around: Option<String>,
        group: Option<String>,
    ) -> (BlockId, Option<String>) {
        let Some(group) = group else {
            return (block, around);
        };
        if self.get(block).group.as_deref() == Some(group.as_str()) {
            return (block, around);
        }
        if self.nesting == Nesting::Groups {
            return (self.packed_region(block, around, &group), None);
        }
        (block, Some(self.inline_region(block, around, &group)))
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

    /// A group's region packed as a block of its own inside a block drawn inline,
    /// made on first use and standing in the cluster around it.
    fn packed_region(&mut self, block: BlockId, around: Option<String>, group: &str) -> BlockId {
        let id = format!(
            "region:{}:{group}",
            around.as_deref().unwrap_or(&self.get(block).id)
        );
        if let Some(&existing) = self.blocks.get(&id) {
            return existing;
        }
        let header = Header::of(tab_of(self.captions.get(group).copied()));
        let made = self.block(
            id.clone(),
            Kind::Region,
            Some(block),
            Some(group.to_owned()),
            Some(header),
        );
        if let Some(around) = around {
            self.get_mut(block).cluster_of.insert(id, around);
        }
        made
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
        if self.local_frames.contains(&node.id) {
            let frame = self.block(
                node.id.clone(),
                Kind::Frame,
                Some(block),
                None,
                Some(header),
            );
            self.get_mut(frame).lone = lone;
            return self.fill(frame, node.kids());
        }
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

/// Nodes in the board's order: by their authored order, stably.
fn by_order(nodes: &[Node]) -> Vec<&Node> {
    let all: Vec<&Node> = nodes.iter().collect();
    sorted_by(&all, |one, other| {
        semantic_order(one.layout_options.as_ref()) - semantic_order(other.layout_options.as_ref())
    })
}
