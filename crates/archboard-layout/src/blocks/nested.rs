//! A board drawn as blocks (the Blocks engine): every container is a block of
//! its own and every group region round more than one node too, each laid out
//! on its own. A block of blocks gathers the cards it holds outside every block
//! into a cluster, so every block holds cards alone or blocks alone.

use std::rc::Rc;

use crate::graph::{Edge, Node};
use crate::track::scene::Set;

use super::headers::Header;
use super::laid::tab_of;
use super::lone::{band_of, card_as, frame_header, placing_group};
use super::tree::{Block, BlockId, BlockTree, Kind};

impl BlockTree {
    /// Fill a block drawn as blocks with nodes, gathering each group's members
    /// into its region.
    pub(super) fn fill_nested(&mut self, block: BlockId, nodes: &[&Node]) -> Result<(), String> {
        for node in nodes {
            let group = placing_group(&mut self.lone, &self.captions, node, nodes);
            let holder = match group {
                None => block,
                Some(group) => self.region(block, &group),
            };
            self.add(holder, node)?;
        }
        Ok(())
    }

    /// Add one node to a block: a container as a block of its own, a card as an item.
    fn add(&mut self, holder: BlockId, node: &Node) -> Result<(), String> {
        if !node.has_children() {
            self.get_mut(holder).items.push(node.id.clone());
            self.holder.insert(node.id.clone(), holder);
            let card = card_as(node, self.lone.get(&node.id));
            self.cards.insert(node.id.clone(), card);
            return Ok(());
        }
        let lone = self.lone.get(&node.id).cloned();
        let header = frame_header(node, lone.as_ref().map_or(0.0, band_of))?;
        let frame = self.block(
            node.id.clone(),
            Kind::Frame,
            Some(holder),
            None,
            Some(header),
        );
        self.get_mut(frame).lone = lone;
        self.fill(frame, node.kids())
    }

    /// A group's region inside a block, made on first use.
    fn region(&mut self, block: BlockId, group: &str) -> BlockId {
        let id = format!("region:{}:{group}", self.get(block).id);
        if let Some(&existing) = self.blocks.get(&id) {
            return existing;
        }
        let header = Header::of(tab_of(self.captions.get(group).copied()));
        self.block(
            id,
            Kind::Region,
            Some(block),
            Some(group.to_owned()),
            Some(header),
        )
    }

    /// Gather loose cards into compact units beside the blocks a parent holds.
    /// A named parent interface keeps disconnected member work independent.
    /// The board's loose collaborators retain their shared rank context.
    pub(super) fn gather(&mut self, block: BlockId, edges: &[Rc<Edge>]) {
        let items = self.get(block).items.clone();
        let inner: Vec<&String> = items.iter().filter(|item| self.is_block(item)).collect();
        for item in &inner {
            self.gather(self.blocks[item.as_str()], edges);
        }
        let loose: Vec<&String> = items.iter().filter(|item| !self.is_block(item)).collect();
        if self.nesting != super::tree::Nesting::Blocks || inner.is_empty() || loose.is_empty() {
            return;
        }
        let groups = card_groups(self.get(block), &loose, edges);
        self.get_mut(block).items.clear();
        for item in &items {
            if self.is_block(item) {
                self.get_mut(block).items.push(item.clone());
            } else if let Some(cards) = groups.iter().find(|cards| cards.first() == Some(item)) {
                self.cluster_cards(block, cards, groups.len() > 1);
            }
        }
    }

    /// Put one related card set into a private layout unit.
    fn cluster_cards(&mut self, block: BlockId, cards: &[String], separate: bool) {
        let suffix = if separate {
            format!(":{}", cards[0])
        } else {
            String::new()
        };
        let id = format!("cluster:{}{suffix}", self.get(block).id);
        let cluster = self.block(id, Kind::Cluster, Some(block), None, None);
        for card in cards {
            self.holder.insert(card.clone(), cluster);
        }
        self.get_mut(cluster).items = cards.to_vec();
    }
}

/// Named parent interfaces can compose unrelated member work independently.
fn card_groups(block: &Block, cards: &[&String], edges: &[Rc<Edge>]) -> Vec<Vec<String>> {
    let interface = block.kind == Kind::Frame
        && edges
            .iter()
            .any(|edge| edge.source() == block.id || edge.target() == block.id);
    if !interface {
        return vec![cards.iter().map(|&card| card.clone()).collect()];
    }
    let mut remaining: Set<String> = cards.iter().map(|&card| card.clone()).collect();
    cards
        .iter()
        .filter_map(|&card| {
            if !remaining.swap_remove(card) {
                return None;
            }
            let members = connected(card, &mut remaining, edges);
            Some(
                cards
                    .iter()
                    .filter(|card| members.contains(card.as_str()))
                    .map(|&card| card.clone())
                    .collect(),
            )
        })
        .collect()
}

/// One undirected component of the remaining loose cards.
fn connected(card: &str, remaining: &mut Set<String>, edges: &[Rc<Edge>]) -> Set<String> {
    let mut members = Set::from_iter([card.to_owned()]);
    let mut at = 0;
    while at < members.len() {
        for edge in edges {
            let next = if edge.source() == members[at] {
                edge.target()
            } else if edge.target() == members[at] {
                edge.source()
            } else {
                continue;
            };
            if remaining.swap_remove(next) {
                members.insert(next.to_owned());
            }
        }
        at += 1;
    }
    members
}
