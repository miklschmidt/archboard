//! Drawn as blocks (the Blocks engine), the board, every container and every
//! group region round more than one node is a block, laid out on its own from
//! its cards and child blocks; its parent places it as one box, as compact as
//! what it holds. A block of blocks gathers the cards it holds outside every
//! block into a cluster, so each block holds cards alone or blocks alone.
//! Drawn inline (the Track engine), only the board and every group region
//! packed as a block of its own (`groups`) are blocks, and every container and
//! every other region is a cluster of the block that lays it out (TASK-349).
//! A folded block's columns are blocks too (`fold.rs`).
//!
//! A relationship is drawn in the lowest block that holds both its ends, and
//! crosses the edge of every block below that through a port: out of the
//! bottom of each block around its source and into the top of each block
//! around its target, or the other way round when it runs upward. Every
//! relationship of one kind that crosses a block's edge to or from the same
//! item shares one port, and every one that runs between the same two ends of
//! a block without a label of its own there shares one line, so what runs
//! between two blocks is drawn once, as a trunk.
//!
//! This file holds the blocks and what they hold. Filling them from the
//! hierarchy is `inline.rs`, drawing the relationships through them is
//! `projection.rs`, and the cycles those find are `cycles.rs`.

use std::rc::Rc;

use crate::geometry::Side;
use crate::graph::{Edge, Node};
use crate::track::chains::LANE;
use crate::track::scene::Map;

use super::headers::Header;
use super::laid::Size;
use super::lone::{Card, Lone, captions_of};
use super::projection::labels_before_joins;

/// How a board's containers and group regions are drawn: each packed as a
/// block of its own, every one inline as a cluster of the board's layout, or
/// containers inline with each group's region packed as a block.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Nesting {
    Blocks,
    Inline,
    Groups,
}

impl Nesting {
    /// The way a solve's options name: `blocks`, `inline` or `groups`.
    ///
    /// # Errors
    ///
    /// When it names another.
    pub(crate) fn named(name: &str) -> Result<Nesting, String> {
        match name {
            "blocks" => Ok(Nesting::Blocks),
            "inline" => Ok(Nesting::Inline),
            "groups" => Ok(Nesting::Groups),
            other => Err(format!(
                "A board is drawn as blocks, inline or with its groups packed (blocks, inline or groups); not {other}."
            )),
        }
    }
}

/// A block's place in the tree.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct BlockId(pub usize);

/// What a block is: the board, a container, a group region packed whole, the
/// cluster of cards a block of blocks holds outside every block, or a column a
/// block folds into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Root,
    Frame,
    Region,
    Cluster,
    Column,
}

/// Whether a cluster is a container or a group region.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ClusterKind {
    Frame,
    Region,
}

/// A container or group region a block of cards draws inline: a cluster of the
/// block's own Graphviz layout rather than a block of its own.
#[derive(Clone, Debug)]
pub(crate) struct Cluster {
    pub id: String,
    pub kind: ClusterKind,
    /// The cluster it sits in, if any.
    pub parent: Option<String>,
    /// The group, for a region.
    pub group: Option<String>,
    /// A frame's title row or a region's caption; a container alone in its
    /// group's region heads the region's caption band too.
    pub header: Header,
    /// The region round a container alone in it, laid out as the container.
    pub lone: Option<Lone>,
}

/// A line inside one block, between two of the block's items.
#[derive(Clone, Debug)]
pub(crate) struct Line {
    /// The line's id in its block: its relationship's when it carries the label.
    pub key: String,
    /// The first relationship drawn on it, for its kind, order and label.
    pub edge: Rc<Edge>,
    /// Its source-side end: a card, a pin, a port or the header.
    pub from: String,
    /// Its target-side end.
    pub to: String,
    /// The end Graphviz ranks above the other.
    pub tail: String,
    /// The end Graphviz ranks below.
    pub head: String,
    /// Whether the relationship's label is drawn on it.
    pub labelled: bool,
    /// The routing identities common to every relationship on this line.
    /// A source with a label before its exit also distinguishes the target.
    pub source: Option<String>,
    pub target: Option<String>,
}

/// A line's ends: where it comes from and goes to, and which Graphviz ranks above the other.
pub(crate) struct Ends {
    pub from: String,
    pub to: String,
    pub tail: String,
    pub head: String,
}

/// A block: the board, a container, a group region, the cluster of cards a
/// block of blocks holds outside every block, or a column a block folds into.
#[derive(Clone, Debug)]
pub(crate) struct Block {
    pub id: String,
    pub kind: Kind,
    pub parent: Option<BlockId>,
    /// The group, for a region.
    pub group: Option<String>,
    /// A container's title row at its top-left, or a region's caption tab
    /// down to the caption's foot.
    pub header: Option<Header>,
    /// The region round a container alone in it, which it is laid out as.
    pub lone: Option<Lone>,
    /// Its cards and the blocks directly inside it, in the board's order.
    pub items: Vec<String>,
    /// The lines it draws, by key.
    pub lines: Map<String, Line>,
    /// Its ports, by id, with the edge each crosses.
    pub ports: Map<String, Side>,
    /// The containers and regions it draws inline, outermost first.
    pub clusters: Map<String, Cluster>,
    /// The innermost inline cluster around each of its items and clusters.
    pub cluster_of: Map<String, String>,
}

impl Block {
    /// The face width that leaves every port its own lane beside the header.
    pub(crate) fn port_width(&self, header: f64) -> f64 {
        [Side::Top, Side::Bottom]
            .into_iter()
            .map(|side| {
                let count = self.ports.values().filter(|&&one| one == side).count();
                if count == 0 {
                    0.0
                } else if side == Side::Top {
                    header + count as f64 * LANE
                } else {
                    count.saturating_sub(1) as f64 * LANE
                }
            })
            .fold(0.0, f64::max)
    }

    /// Whether one of its ports stands on its bottom.
    pub(crate) fn has_bottom_port(&self) -> bool {
        self.ports.values().any(|&side| side == Side::Bottom)
    }

    /// The innermost container a block draws inline around one of its items,
    /// passing over regions, starting from a cluster.
    pub(crate) fn frame_around(&self, start: Option<&str>) -> Option<String> {
        let mut at = start;
        while let Some(id) = at {
            let cluster = &self.clusters[id];
            if cluster.kind != ClusterKind::Region {
                return Some(id.to_owned());
            }
            at = cluster.parent.as_deref();
        }
        None
    }

    /// The clusters around an id, innermost first, starting from the one it stands in.
    pub(crate) fn clusters_from<'b>(&'b self, start: Option<&'b str>) -> Vec<&'b str> {
        let mut chain = Vec::new();
        let mut at = start;
        while let Some(id) = at {
            chain.push(id);
            at = self
                .clusters
                .get(id)
                .and_then(|cluster| cluster.parent.as_deref());
        }
        chain
    }
}

/// Where one relationship is drawn: its block, and the blocks it leaves and enters.
#[derive(Clone, Debug)]
pub(crate) struct Projection {
    pub edge: Rc<Edge>,
    /// The lowest block holding both ends.
    pub at: BlockId,
    /// The blocks it leaves, innermost first.
    pub out: Vec<BlockId>,
    /// The blocks it enters, innermost first.
    pub into: Vec<BlockId>,
    /// Its source-side item in `at`.
    pub from: String,
    /// Its target-side item in `at`.
    pub to: String,
}

/// One part of a relationship: the block it is drawn in and its line there.
pub(crate) type Piece = (BlockId, String);

/// How one relationship is drawn: its lines in order, and the block that holds its label.
#[derive(Clone, Debug)]
pub(crate) struct Route {
    pub pieces: Vec<Piece>,
    pub label_at: BlockId,
}

/// Where a pin meets its child block: the block and its port.
#[derive(Clone, Debug)]
pub(crate) struct Pin {
    pub block: BlockId,
    pub port: String,
}

/// The id of a block's header item.
pub(crate) fn header_of(block: &Block) -> String {
    format!("header:{}", block.id)
}

/// The key a port's moved edge is kept by (`sides.rs`).
pub(crate) fn exit_key(block: &str, way: &str, face: Side, along: &str) -> String {
    format!("{block}|port:{way}|{}|{along}", face.name())
}

/// The board's blocks and every relationship's lines through them.
pub(crate) struct BlockTree {
    pub arena: Vec<Block>,
    pub blocks: Map<String, BlockId>,
    /// The block holding each card, and each container drawn inline, as an item.
    pub holder: Map<String, BlockId>,
    pub root: BlockId,
    pub captions: Map<String, Size>,
    /// Every card's measured size and peer group; a card alone in its region takes the region's box.
    pub cards: Map<String, Card>,
    /// Every card alone in its group's region, by id.
    pub lone: Map<String, Lone>,
    /// Nodes drawn inline that are entry points of their container, each true when first.
    pub entries: Map<String, bool>,
    /// Every relationship's projection, in the board's order.
    pub projections: Vec<Projection>,
    /// How each relationship is drawn, by id.
    pub routes: Map<String, Route>,
    /// Where each pin meets its child block.
    pub pins: Map<String, Pin>,
    /// The wall each port moves to, keyed by `exit_key`.
    pub exits: Map<String, Side>,
    pub nesting: Nesting,
    /// The ports each block holds in an order on a face, keyed `block|face` (`orders.rs`).
    pub orders: Map<String, Vec<String>>,
}

/// What an earlier layout of a board decided, which laying it out again keeps.
#[derive(Clone, Debug, Default)]
pub(crate) struct Kept {
    /// The wall each port moves to, keyed by `exit_key` (`sides.rs`).
    pub exits: Map<String, Side>,
    /// The ports each block holds in an order on a face, keyed `block|face`.
    pub orders: Map<String, Vec<String>>,
}

impl BlockTree {
    /// Read the blocks of a measured hierarchy and project its relationships.
    ///
    /// # Errors
    ///
    /// When the hierarchy's measured options are unreadable, or a relationship
    /// names a node the hierarchy does not hold.
    pub(crate) fn new(graph: &Node, kept: Kept, nesting: Nesting) -> Result<BlockTree, String> {
        let mut tree = BlockTree {
            arena: Vec::new(),
            blocks: Map::default(),
            holder: Map::default(),
            root: BlockId(0),
            captions: captions_of(graph)?,
            cards: Map::default(),
            lone: Map::default(),
            entries: Map::default(),
            projections: Vec::new(),
            routes: Map::default(),
            pins: Map::default(),
            exits: kept.exits,
            nesting,
            orders: kept.orders,
        };
        tree.root = tree.block(":root".to_owned(), Kind::Root, None, None, None);
        tree.fill(tree.root, graph.kids())?;
        tree.gather(tree.root);
        tree.projections = graph
            .edges
            .iter()
            .flatten()
            .filter(|edge| edge.source() != edge.target())
            .cloned()
            .map(|edge| tree.project(edge))
            .collect::<Result<_, _>>()?;
        let back = tree.back_edges();
        let before = labels_before_joins(&tree.projections, &back);
        for index in 0..tree.projections.len() {
            let projection = tree.projections[index].clone();
            let before = before.contains(&projection.edge.id);
            tree.draw(&projection, &back, before);
        }
        Ok(tree)
    }

    /// A block.
    pub(crate) fn get(&self, id: BlockId) -> &Block {
        &self.arena[id.0]
    }

    /// A block, to change.
    pub(crate) fn get_mut(&mut self, id: BlockId) -> &mut Block {
        &mut self.arena[id.0]
    }

    /// The block of an item, if the item is one.
    pub(crate) fn block_of(&self, item: &str) -> Option<BlockId> {
        self.blocks.get(item).copied()
    }

    /// Whether an item is a block.
    pub(crate) fn is_block(&self, item: &str) -> bool {
        self.blocks.contains_key(item)
    }

    /// Make a block, and add it to its parent's items.
    pub(crate) fn block(
        &mut self,
        id: String,
        kind: Kind,
        parent: Option<BlockId>,
        group: Option<String>,
        header: Option<Header>,
    ) -> BlockId {
        let made = BlockId(self.arena.len());
        self.arena.push(Block {
            id: id.clone(),
            kind,
            parent,
            group,
            header,
            lone: None,
            items: Vec::new(),
            lines: Map::default(),
            ports: Map::default(),
            clusters: Map::default(),
            cluster_of: Map::default(),
        });
        self.blocks.insert(id.clone(), made);
        if let Some(parent) = parent {
            self.get_mut(parent).items.push(id);
        }
        made
    }

    /// The blocks around a node, innermost first.
    pub(crate) fn above(&self, id: &str) -> Vec<BlockId> {
        let mut chain = Vec::new();
        let start = self
            .blocks
            .get(id)
            .and_then(|&block| self.get(block).parent)
            .or_else(|| self.holder.get(id).copied());
        let mut at = start;
        while let Some(block) = at {
            chain.push(block);
            at = self.get(block).parent;
        }
        chain
    }

    /// Every block, each after the blocks inside it.
    pub(crate) fn innermost_first(&self, block: BlockId) -> Vec<BlockId> {
        let mut all = Vec::new();
        for item in &self.get(block).items {
            if let Some(&inner) = self.blocks.get(item) {
                all.extend(self.innermost_first(inner));
            }
        }
        all.push(block);
        all
    }
}

/// Whether a container or region a block draws inline holds an item, however deep.
pub(crate) fn holds(block: &Block, cluster: &str, item: &str) -> bool {
    let mut at = block.cluster_of.get(item);
    while let Some(around) = at {
        if around == cluster {
            return true;
        }
        at = block.cluster_of.get(around.as_str());
    }
    false
}
