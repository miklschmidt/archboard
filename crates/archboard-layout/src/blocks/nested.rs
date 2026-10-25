//! A board drawn as blocks (the Blocks engine): every container is a block of
//! its own and every group region round more than one node too, each laid out
//! on its own. A block of blocks gathers the cards it holds outside every block
//! into a cluster, so every block holds cards alone or blocks alone.

use crate::graph::Node;

use super::headers::Header;
use super::laid::tab_of;
use super::lone::{band_of, card_as, frame_header, placing_group};
use super::tree::{BlockId, BlockTree, Kind};

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

    /// Gather the cards a block of blocks holds outside every block into one
    /// cluster, in this block and every block inside it, so every block holds
    /// cards alone or blocks alone. Drawn inline, a block of cards keeps its
    /// packed regions among its cards.
    pub(super) fn gather(&mut self, block: BlockId) {
        let items = self.get(block).items.clone();
        let inner: Vec<&String> = items.iter().filter(|item| self.is_block(item)).collect();
        for item in &inner {
            self.gather(self.blocks[item.as_str()]);
        }
        let loose: Vec<&String> = items.iter().filter(|item| !self.is_block(item)).collect();
        if self.nesting != super::tree::Nesting::Blocks || inner.is_empty() || loose.is_empty() {
            return;
        }
        let at = items
            .iter()
            .position(|item| item == loose[0])
            .expect("a loose card is an item");
        let before = inner
            .iter()
            .filter(|item| items.iter().position(|one| one == **item) < Some(at))
            .count();
        let id = format!("cluster:{}", self.get(block).id);
        self.get_mut(block).items = inner[..before].iter().map(|&item| item.clone()).collect();
        let cluster = self.block(id, Kind::Cluster, Some(block), None, None);
        let rest: Vec<String> = inner[before..].iter().map(|&item| item.clone()).collect();
        self.get_mut(block).items.extend(rest);
        let cards: Vec<String> = loose.iter().map(|&card| card.clone()).collect();
        for card in &cards {
            self.holder.insert(card.clone(), cluster);
        }
        self.get_mut(cluster).items.extend(cards);
    }
}
