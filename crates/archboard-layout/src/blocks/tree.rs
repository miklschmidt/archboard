//! The board and every group region packed as a block of its own (`groups`)
//! are blocks, each laid out on its own from its cards and child blocks; a
//! folded block's columns are blocks too (`fold.rs`). Track draws every
//! container and every other region inline, as a cluster of the block that
//! lays it out (TASK-349).
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
//! The TypeScript engine also packed containers as blocks (the Blocks
//! engine); a Track solve never does, so no block here is a container.

use std::rc::Rc;

use crate::ecma::sorted_by;
use crate::geometry::Side;
use crate::graph::{ENTRY_POINT, Edge, Node, semantic_order};
use crate::track::route::trunk_kind;
use crate::track::scene::{Map, Set};

use super::headers::Header;
use super::laid::{Size, tab_of};
use super::lone::{Card, Lone, band_of, captions_of, card_as, frame_header, placing_group};

/// How a board's containers and group regions are drawn: every one inline
/// as a cluster of the board's layout, or containers inline with each group's
/// region packed as a block.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Nesting {
    Inline,
    Groups,
}

/// A block's place in the tree.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct BlockId(pub usize);

/// What a block is: the board, a group region packed whole, or a column a block folds into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Root,
    Region,
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
}

/// A line's ends: where it comes from and goes to, and which Graphviz ranks above the other.
pub(crate) struct Ends {
    pub from: String,
    pub to: String,
    pub tail: String,
    pub head: String,
}

/// A block: the board, a group region packed whole, or a column a block folds into.
#[derive(Clone, Debug)]
pub(crate) struct Block {
    pub id: String,
    pub kind: Kind,
    pub parent: Option<BlockId>,
    /// The group, for a region.
    pub group: Option<String>,
    /// A region's caption tab down to the caption's foot.
    pub header: Option<Header>,
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

/// What a port on a side wall adds to its key: the line's end inside the
/// block. Each line crosses a wall on the track it runs on inside, so lines
/// from different items never share a wall port.
fn walled(side: Side, inner: &str) -> String {
    if matches!(side, Side::Left | Side::Right) {
        format!("{inner}|")
    } else {
        String::new()
    }
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
    /// The relationships that keep ports of their own rather than join others, by id.
    pub apart: Set<String>,
    /// The wall each port moves to, keyed by `exit_key`.
    pub exits: Map<String, Side>,
    pub nesting: Nesting,
}

impl BlockTree {
    /// Read the blocks of a measured hierarchy and project its relationships.
    ///
    /// # Errors
    ///
    /// When the hierarchy's measured options are unreadable, or a relationship
    /// names a node the hierarchy does not hold.
    pub(crate) fn new(
        graph: &Node,
        exits: Map<String, Side>,
        nesting: Nesting,
        apart: &Set<String>,
    ) -> Result<BlockTree, String> {
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
            apart: Set::default(),
            exits,
            nesting,
        };
        tree.root = tree.block(":root".to_owned(), Kind::Root, None, None, None);
        tree.fill(tree.root, graph.kids())?;
        let edges: Vec<Rc<Edge>> = graph
            .edges
            .iter()
            .flatten()
            .filter(|edge| edge.source() != edge.target())
            .cloned()
            .collect();
        tree.projections = edges
            .into_iter()
            .map(|edge| tree.project(edge))
            .collect::<Result<_, _>>()?;
        let back = tree.back_edges();
        let (before, own) = join_ways(&tree.projections, &tree.arena, &back, apart);
        tree.apart = own;
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

    /// Fill a block with nodes, each in its group's region.
    fn fill(&mut self, block: BlockId, nodes: &[Node]) -> Result<(), String> {
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

    /// The blocks between a node and a block around it, innermost first, or
    /// nothing when the block does not hold the node.
    fn inside(&self, id: &str, frame: &str) -> Option<Vec<BlockId>> {
        let block = self.blocks.get(frame)?;
        let chain = self.above(id);
        let index = chain.iter().position(|one| one == block)?;
        Some(chain[..index].to_vec())
    }

    /// Where a relationship is drawn: in the block it leaves from or goes to
    /// when that block holds its other end, else in the lowest block holding both.
    fn project(&self, edge: Rc<Edge>) -> Result<Projection, String> {
        let (source, target) = (edge.source().to_owned(), edge.target().to_owned());
        if let Some(into) = self.inside(&target, &source) {
            let at = self.blocks[source.as_str()];
            let to = into
                .last()
                .map_or(target, |&outer| self.get(outer).id.clone());
            return Ok(Projection {
                edge,
                at,
                out: Vec::new(),
                into,
                from: header_of(self.get(at)),
                to,
            });
        }
        if let Some(out) = self.inside(&source, &target) {
            let at = self.blocks[target.as_str()];
            let from = out
                .last()
                .map_or(source, |&outer| self.get(outer).id.clone());
            return Ok(Projection {
                edge,
                at,
                out,
                into: Vec::new(),
                from,
                to: header_of(self.get(at)),
            });
        }
        let (from_chain, to_chain) = (self.above(&source), self.above(&target));
        let at = *from_chain
            .iter()
            .find(|block| to_chain.contains(block))
            .ok_or_else(|| {
                format!(
                    "Relationship {} names a node the board does not hold.",
                    edge.id
                )
            })?;
        let out = from_chain[..from_chain.iter().position(|&one| one == at).unwrap_or(0)].to_vec();
        let into = to_chain[..to_chain.iter().position(|&one| one == at).unwrap_or(0)].to_vec();
        let from = out
            .last()
            .map_or(source, |&outer| self.get(outer).id.clone());
        let to = into
            .last()
            .map_or(target, |&outer| self.get(outer).id.clone());
        Ok(Projection {
            edge,
            at,
            out,
            into,
            from,
            to,
        })
    }

    /// The relationships that close a cycle in the block they are drawn in,
    /// found depth-first from the items nothing points at, in the board's
    /// order. A line into its own container runs upward.
    pub(crate) fn back_edges(&self) -> Set<String> {
        let mut back = Set::default();
        for &block in self.blocks.values() {
            back.extend(self.back_edges_in(block));
        }
        back
    }

    /// The relationships that close a cycle in one block.
    fn back_edges_in(&self, id: BlockId) -> Set<String> {
        let block = self.get(id);
        let here: Vec<&Projection> = self
            .projections
            .iter()
            .filter(|projection| projection.at == id)
            .collect();
        let header = header_of(block);
        let upward: Vec<bool> = here
            .iter()
            .map(|projection| {
                projection.to == header || holds(block, &projection.to, &projection.from)
            })
            .collect();
        let mut walk = CycleWalk::default();
        for (projection, &up) in here.iter().zip(&upward) {
            if !up {
                walk.add(&projection.from, &projection.to, Some(&projection.edge.id));
            }
        }
        let containment: Vec<(String, String)> = block
            .cluster_of
            .iter()
            .filter(|&(_, around)| block.clusters[around.as_str()].kind == ClusterKind::Frame)
            .map(|(member, around)| (member.clone(), around.clone()))
            .collect();
        let mut items = vec![header];
        items.extend(block.items.iter().cloned());
        let walked = walk.with_containment(&items, &containment);
        let mut back: Set<String> = here
            .iter()
            .zip(&upward)
            .filter(|&(_, &up)| up)
            .map(|(projection, _)| projection.edge.id.clone())
            .collect();
        back.extend(walked);
        back
    }

    /// Give a relationship its lines: one in each block it leaves or enters,
    /// and one in the block that holds both ends.
    fn draw(&mut self, projection: &Projection, back: &Set<String>, before: bool) {
        let edge = &projection.edge;
        let upward = back.contains(&edge.id);
        let label_at = if before {
            projection.out.first().copied().unwrap_or(projection.at)
        } else {
            projection
                .into
                .first()
                .or(projection.out.first())
                .copied()
                .unwrap_or(projection.at)
        };
        let (mut pieces, from) = self.leave(projection, upward, label_at);
        let (entering, to) = self.enter(projection, upward, label_at);
        let (tail, head) = if upward {
            (to.clone(), from.clone())
        } else {
            (from.clone(), to.clone())
        };
        let at = projection.at;
        let middle = self.line(
            at,
            edge,
            Ends {
                from,
                to,
                tail,
                head,
            },
            at == label_at,
        );
        pieces.push((at, middle));
        pieces.extend(entering);
        self.routes
            .insert(edge.id.clone(), Route { pieces, label_at });
    }

    /// A relationship's lines in the blocks it leaves, innermost first, and
    /// the end they leave it at in the block that holds both ends.
    fn leave(
        &mut self,
        projection: &Projection,
        upward: bool,
        label_at: BlockId,
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Top } else { Side::Bottom };
        let mut pieces = Vec::new();
        let mut from = if projection.out.is_empty() {
            projection.from.clone()
        } else {
            edge.source().to_owned()
        };
        for &block in &projection.out {
            let along = format!("{}|{}", projection.to, self.kind_of(edge));
            let side = self.exit_of(block, "out", face, &along, Some(label_at));
            // A line that carries its label to a wall reaches it under the label,
            // not under its card, so it shares no wall port.
            let inner = if block == label_at {
                format!("{}|{from}", edge.id)
            } else {
                from.clone()
            };
            let port = self.port(
                block,
                format!("out|{}|{}{along}", side.name(), walled(side, &inner)),
                side,
            );
            let (tail, head) = if side == Side::Top {
                (port.clone(), from.clone())
            } else {
                (from.clone(), port.clone())
            };
            let line = self.line(
                block,
                edge,
                Ends {
                    from: from.clone(),
                    to: port.clone(),
                    tail,
                    head,
                },
                block == label_at,
            );
            pieces.push((block, line));
            from = self.pin(block, &port);
        }
        (pieces, from)
    }

    /// A relationship's lines in the blocks it enters, outermost first, and
    /// the end they enter from in the block that holds both ends.
    fn enter(
        &mut self,
        projection: &Projection,
        upward: bool,
        label_at: BlockId,
    ) -> (Vec<Piece>, String) {
        let edge = &projection.edge;
        let face = if upward { Side::Bottom } else { Side::Top };
        let mut pieces = Vec::new();
        let mut to = if projection.into.is_empty() {
            projection.to.clone()
        } else {
            edge.target().to_owned()
        };
        for &block in &projection.into {
            let along = format!("{}|{}", projection.from, self.kind_of(edge));
            let side = self.exit_of(block, "in", face, &along, None);
            let port = self.port(
                block,
                format!("in|{}|{}{along}", side.name(), walled(side, &to)),
                side,
            );
            let (tail, head) = if side == Side::Bottom {
                (to.clone(), port.clone())
            } else {
                (port.clone(), to.clone())
            };
            let line = self.line(
                block,
                edge,
                Ends {
                    from: port.clone(),
                    to: to.clone(),
                    tail,
                    head,
                },
                block == label_at,
            );
            pieces.insert(0, (block, line));
            to = self.pin(block, &port);
        }
        (pieces, to)
    }

    /// What a relationship's ports on a block's edge share: its kind and look, or its own id.
    pub(crate) fn kind_of(&self, edge: &Edge) -> String {
        if self.apart.contains(&edge.id) {
            format!("{}|{}", trunk_kind(edge), edge.id)
        } else {
            trunk_kind(edge)
        }
    }

    /// The edge a port crosses: the wall an earlier layout moved it to, or its
    /// face; where it leaves the block with its label, its face.
    fn exit_of(
        &self,
        block: BlockId,
        way: &str,
        face: Side,
        along: &str,
        label_at: Option<BlockId>,
    ) -> Side {
        if Some(block) == label_at {
            return face;
        }
        self.exits
            .get(&exit_key(&self.get(block).id, way, face, along))
            .copied()
            .unwrap_or(face)
    }

    /// A block's port, made on first use.
    pub(crate) fn port(&mut self, block: BlockId, key: String, side: Side) -> String {
        let id = format!("port:{key}");
        self.get_mut(block).ports.insert(id.clone(), side);
        id
    }

    /// The item where a child block's port meets its parent's lines.
    pub(crate) fn pin(&mut self, block: BlockId, port: &str) -> String {
        let id = format!("pin:{}:{port}", self.get(block).id);
        self.pins.insert(
            id.clone(),
            Pin {
                block,
                port: port.to_owned(),
            },
        );
        id
    }

    /// A line in a block, shared with every relationship that runs between the
    /// same ends here without a label of its own.
    fn line(&mut self, block: BlockId, edge: &Rc<Edge>, ends: Ends, labelled: bool) -> String {
        let carries = labelled && edge.label_count() > 0;
        let key = if carries {
            edge.id.clone()
        } else {
            format!("{}>{}|{}", ends.from, ends.to, trunk_kind(edge))
        };
        let lines = &mut self.get_mut(block).lines;
        if !lines.contains_key(&key) {
            let Ends {
                from,
                to,
                tail,
                head,
            } = ends;
            lines.insert(
                key.clone(),
                Line {
                    key: key.clone(),
                    edge: Rc::clone(edge),
                    from,
                    to,
                    tail,
                    head,
                    labelled: carries,
                },
            );
        }
        key
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

/// Nodes in the board's order: by their authored order, stably.
fn by_order(nodes: &[Node]) -> Vec<&Node> {
    let all: Vec<&Node> = nodes.iter().collect();
    sorted_by(&all, |one, other| {
        semantic_order(one.layout_options.as_ref()) - semantic_order(other.layout_options.as_ref())
    })
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

/// Whether one item leads down to another, as edges are added.
#[derive(Default)]
pub(crate) struct Below {
    next: Map<String, Vec<String>>,
}

impl Below {
    /// Record that one item ranks below another.
    pub(crate) fn add(&mut self, tail: &str, head: &str) {
        self.next
            .entry(tail.to_owned())
            .or_default()
            .push(head.to_owned());
    }

    /// Every item one leads down to, itself among them.
    pub(crate) fn reach(&self, from: &str) -> Set<String> {
        let mut seen: Set<String> = Set::default();
        let mut open = vec![from.to_owned()];
        while let Some(at) = open.pop() {
            if !seen.contains(&at)
                && let Some(next) = self.next.get(&at)
            {
                open.extend(next.iter().cloned());
            }
            seen.insert(at);
        }
        seen
    }

    /// Whether one item leads down to another.
    pub(crate) fn reaches(&self, from: &str, target: &str) -> bool {
        let mut seen: Set<String> = Set::default();
        let mut open = vec![from.to_owned()];
        while let Some(at) = open.pop() {
            if at == target {
                return true;
            }
            if !seen.contains(&at)
                && let Some(next) = self.next.get(&at)
            {
                open.extend(next.iter().cloned());
            }
            seen.insert(at);
        }
        false
    }
}

/// Where a depth-first walk stands at an item.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Walked {
    Open,
    Done,
}

/// A depth-first walk over one block's projections that finds the ones closing a cycle.
#[derive(Default)]
struct CycleWalk {
    back: Set<String>,
    state: Map<String, Walked>,
    out: Map<String, Vec<(String, Option<String>)>>,
}

impl CycleWalk {
    /// Add an ordering constraint. Containment has no relationship to reverse.
    fn add(&mut self, from: &str, to: &str, edge: Option<&str>) {
        self.out
            .entry(from.to_owned())
            .or_default()
            .push((to.to_owned(), edge.map(str::to_owned)));
    }

    /// Find cycles from unconstrained roots first, then in authored order.
    fn walk(&mut self, items: &[String]) -> Set<String> {
        let pointed: Set<&String> = self.out.values().flatten().map(|(to, _)| to).collect();
        let roots: Vec<String> = items
            .iter()
            .filter(|item| !pointed.contains(item))
            .cloned()
            .collect();
        for item in &roots {
            self.from(item);
        }
        for item in items {
            self.from(item);
        }
        std::mem::take(&mut self.back)
    }

    /// Add only containment constraints that participate in a cycle.
    fn with_containment(
        &mut self,
        items: &[String],
        containment: &[(String, String)],
    ) -> Set<String> {
        let mut below = Below::default();
        for (from, links) in &self.out {
            for (to, _) in links {
                below.add(from, to);
            }
        }
        for (member, around) in containment {
            below.add(around, member);
        }
        let cyclic: Vec<&(String, String)> = containment
            .iter()
            .filter(|(member, around)| below.reaches(member, around))
            .collect();
        for (member, around) in &cyclic {
            self.add(around, member, None);
        }
        let frames: Set<String> = cyclic.iter().map(|(_, around)| around.clone()).collect();
        let mut walked: Vec<String> = frames.into_iter().collect();
        walked.extend(items.iter().cloned());
        self.walk(&walked)
    }

    /// Walk from one item, unless the walk has been there.
    fn from(&mut self, item: &str) {
        if self.state.contains_key(item) {
            return;
        }
        self.state.insert(item.to_owned(), Walked::Open);
        let links = self.out.get(item).cloned().unwrap_or_default();
        for (to, edge) in links {
            if self.state.get(&to) == Some(&Walked::Open) {
                if let Some(edge) = edge {
                    self.back.insert(edge);
                }
            } else {
                self.from(&to);
            }
        }
        self.state.insert(item.to_owned(), Walked::Done);
    }
}

/// Lines that join on the way to one card stay one line into it (`joins.ts`):
/// each line of a join keeps its label before the join, by its source, or,
/// where its block is kept apart, keeps ports of its own. The relationships
/// in joins each way, by id.
fn join_ways(
    projections: &[Projection],
    arena: &[Block],
    back: &Set<String>,
    apart: &Set<String>,
) -> (Set<String>, Set<String>) {
    let joins: Vec<String> = projections
        .iter()
        .map(|projection| {
            if projection.into.is_empty() {
                return String::new();
            }
            let upward = back.contains(&projection.edge.id);
            format!(
                "{}|{}|{}|{upward}",
                projection.from,
                projection.edge.target(),
                trunk_kind(&projection.edge)
            )
        })
        .collect();
    let mut counts: Map<&str, usize> = Map::default();
    for join in &joins {
        *counts.entry(join.as_str()).or_default() += 1;
    }
    let (mut before, mut own) = (Set::default(), Set::default());
    for (projection, join) in projections.iter().zip(&joins) {
        if join.is_empty() || counts[join.as_str()] == 1 {
            continue;
        }
        let block = &arena[projection.out.first().copied().unwrap_or(projection.at).0].id;
        if apart.contains(block) {
            &mut own
        } else {
            &mut before
        }
        .insert(projection.edge.id.clone());
    }
    (before, own)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_walk_turns_the_line_that_closes_a_cycle() {
        let mut walk = CycleWalk::default();
        walk.add("a", "b", Some("ab"));
        walk.add("b", "c", Some("bc"));
        walk.add("c", "a", Some("ca"));
        let items: Vec<String> = ["a", "b", "c"].map(str::to_owned).to_vec();
        let back = walk.with_containment(&items, &[]);
        assert_eq!(back.into_iter().collect::<Vec<_>>(), vec!["ca".to_owned()]);
    }

    #[test]
    fn below_reaches_down_its_edges() {
        let mut below = Below::default();
        below.add("a", "b");
        below.add("b", "c");
        assert!(below.reaches("a", "c"));
        assert!(!below.reaches("c", "a"));
        assert_eq!(below.reach("b").len(), 2);
    }
}
