//! Where the ports on a block's top and bottom stand, settled where both ends
//! of the trunk through them are known. Every block is laid out innermost
//! first, so each first places its ports alone, before the block that routes
//! the trunk between them exists, and the trunk then runs sideways from one
//! to the other, or overshoots and doubles back. Once every block is laid
//! out, the blocks are walked outermost first: in each block that holds
//! blocks, the two ends of every trunk stand in one column where their edges
//! share one, or else as near each other as their edges allow; each block
//! inside is routed again with its ports there, and the block is packed or
//! routed again as it was.
//!
//! A block of cards drawn inline (Track) holds its ports where its lines
//! first turn, and a line settling a pin there reaches it only where it drops
//! straight (`turns_from`, `clear_of`).

use std::rc::Rc;

use crate::ecma::{js_max, js_min, max, min, sort_by};
use crate::geometry::{Rect, Side};
use crate::track::chains::LANE;
use crate::track::channels::port_reach;
use crate::track::scene::Map;

use super::laid::{Laid, LaidMap};
use super::legacy::insets_of;
use super::lone::card_in;
use super::packing::{
    PACK_GAP, PackLayout, Packing, Span, TRUNK_CLEARANCE, open_stretch, separate_facing_ports,
    spread,
};
use super::tree::{Block, BlockId, BlockTree, Line, header_of};

/// A box's middle across.
fn middle(at: &Rect) -> f64 {
    at.x + at.width / 2.0
}

/// The part two spans share, if any.
fn overlap(one: Span, other: Span) -> Option<Span> {
    let (low, high) = (js_max(one.0, other.0), js_min(one.1, other.1));
    (low <= high).then_some((low, high))
}

/// The point of a span nearest another span.
fn nearest(span: Span, other: Span) -> f64 {
    if span.1 < other.0 {
        return span.1;
    }
    if span.0 > other.1 {
        return span.0;
    }
    f64::midpoint(js_max(span.0, other.0), js_min(span.1, other.1))
}

/// Where two ends of one line stand: in one column where their spans share
/// one, as near where they stand now as that allows, or else each as near
/// the other as its span allows.
fn facing(one: Span, other: Span, now: f64) -> (f64, f64) {
    if let Some(shared) = overlap(one, other) {
        let x = js_min(shared.1, js_max(shared.0, now));
        return (x, x);
    }
    (nearest(one, other), nearest(other, one))
}

/// The picture laid out, as settling reads and writes it.
pub(crate) struct Settling<'s> {
    pub tree: &'s BlockTree,
    /// Every block laid out; each block routed again replaces its own.
    pub laid: &'s mut LaidMap,
    /// How each block of blocks is packed.
    pub packings: &'s Map<String, Packing>,
}

impl Settling<'_> {
    /// A block laid out.
    fn laid_of(&self, block: &Block) -> &Laid {
        &self.laid[block.id.as_str()]
    }

    /// Whether a block can be routed again with its ports moved: a block of
    /// blocks, or a block of cards that kept its placement.
    fn movable(&self, block: &Block) -> bool {
        self.packings.contains_key(&block.id)
            || self
                .laid
                .get(block.id.as_str())
                .is_some_and(|laid| laid.reroute.is_some())
    }

    /// The stretch of a block's edge where one of its ports may stand, in the
    /// block's own coordinates: the edge within its insets, right of its
    /// header on the top, and over what the port's lines inside reach when
    /// that is narrower.
    fn span_of(&self, block: &Block, port: &str) -> Span {
        let inner = self.laid_of(block);
        if block.header_entry(port) {
            return super::headers::header_reach(block, inner);
        }
        let side = insets_of(block).side;
        let header = inner.boxes.get(&header_of(block));
        let top = block.ports.get(port) == Some(&Side::Top);
        let clearance = if self.packings.contains_key(&block.id) {
            TRUNK_CLEARANCE
        } else {
            LANE
        };
        let low = header
            .filter(|_| top)
            .map_or(side, |header| header.x + header.width + clearance);
        let edge = (low, js_max(low, inner.width - side));
        let reach = self
            .reach_of(block, port)
            .unwrap_or_else(|| self.open_of(block, port, edge));
        overlap(edge, reach).unwrap_or(edge)
    }

    /// The stretch of a block of blocks' edge a trunk inside can reach a port
    /// on straight: clear of every block standing nearer the edge than packed
    /// blocks stand to each other, the free stretch nearest where the port
    /// stands. The whole edge for a block of cards.
    fn open_of(&self, block: &Block, port: &str, edge: Span) -> Span {
        if !self.packings.contains_key(&block.id) {
            return edge;
        }
        let inner = self.laid_of(block);
        let top = block.ports.get(port) == Some(&Side::Top);
        let face = if top {
            inner
                .boxes
                .get(&header_of(block))
                .map_or(0.0, |header| header.height)
        } else {
            inner.height
        };
        let against: Vec<Rect> = block
            .items
            .iter()
            .map(|item| inner.boxes[item.as_str()])
            .filter(|at| {
                let apart = if top {
                    at.y - face
                } else {
                    face - at.y - at.height
                };
                apart < PACK_GAP
            })
            .collect();
        open_stretch(edge, &against, TRUNK_CLEARANCE, middle(&inner.boxes[port]))
    }

    /// What a port's one line inside its block reaches: the face of the card it
    /// runs to or the span of the port it runs to on a block inside.
    fn reach_of(&self, block: &Block, port: &str) -> Option<Span> {
        let lines: Vec<&Line> = block
            .lines
            .values()
            .filter(|line| line.from == port || line.to == port)
            .collect();
        (lines.len() == 1)
            .then(|| self.line_reach(block, port, lines[0]))
            .flatten()
    }

    /// What a port's one line inside its block reaches: the face of the card
    /// it runs to, or the span of the port it runs to on a block inside.
    fn line_reach(&self, block: &Block, port: &str, line: &Line) -> Option<Span> {
        let inner = self.laid_of(block);
        let other = if line.from == port {
            &line.to
        } else {
            &line.from
        };
        if let Some(pin) = self.tree.pins.get(other) {
            let child = self.tree.get(pin.block);
            let at = inner.boxes[child.id.as_str()].x;
            let (low, high) = self.end_span(child, &pin.port);
            return Some((low + at, high + at));
        }
        if !self.tree.cards.contains_key(other) {
            return None;
        }
        let card = *inner.boxes.get(other)?;
        Some(port_reach(
            &self
                .tree
                .lone
                .get(other)
                .map_or(card, |lone| card_in(card, lone)),
        ))
    }

    /// Where a port may stand, as its block sees it: its span when the block
    /// can be routed again, else where it stands.
    fn end_span(&self, block: &Block, port: &str) -> Span {
        let side = block.ports.get(port);
        if self.movable(block) && matches!(side, Some(Side::Top | Side::Bottom)) {
            return self.span_of(block, port);
        }
        let x = middle(&self.laid_of(block).boxes[port]);
        (x, x)
    }

    /// Where one end of a line may stand, in the block's coordinates: a pin on
    /// a block inside, the block's own port where its parent settled it, or its header.
    fn span_in(&self, block: &Block, end: &str, own: &Map<String, f64>) -> Span {
        let boxes = &self.laid_of(block).boxes;
        if let Some(pin) = self.tree.pins.get(end) {
            let child = self.tree.get(pin.block);
            let at = boxes[child.id.as_str()].x;
            let (low, high) = self.end_span(child, &pin.port);
            return (low + at, high + at);
        }
        let at = boxes.get(end);
        if end == header_of(block) {
            let at = at.expect("a header's box");
            return (at.x, at.x + at.width);
        }
        let x = own
            .get(end)
            .copied()
            .unwrap_or_else(|| middle(at.expect("an end's box")));
        (x, x)
    }

    /// Where one end of a line stands now, in the block's coordinates.
    fn now_in(&self, block: &Block, end: &str, own: &Map<String, f64>) -> f64 {
        let boxes = &self.laid_of(block).boxes;
        let Some(pin) = self.tree.pins.get(end) else {
            return own.get(end).copied().unwrap_or_else(|| middle(&boxes[end]));
        };
        let child = self.tree.get(pin.block);
        boxes[child.id.as_str()].x + middle(&self.laid_of(child).boxes[pin.port.as_str()])
    }

    /// Whether where a line's end stands now means anything: all but a pin on
    /// a port no line inside its block runs through, the port a relationship
    /// to the container itself makes, which stands wherever its block put it.
    fn holds(&self, end: &str) -> bool {
        let Some(pin) = self.tree.pins.get(end) else {
            return true;
        };
        self.tree
            .get(pin.block)
            .lines
            .values()
            .any(|line| line.from == pin.port || line.to == pin.port)
    }

    /// Where a line stands now: between its ends that hold where they stand,
    /// or between both when neither does.
    fn standing(&self, block: &Block, ends: [&str; 2], own: &Map<String, f64>) -> f64 {
        let held: Vec<&str> = ends.iter().copied().filter(|end| self.holds(end)).collect();
        let standing = if held.is_empty() { ends.to_vec() } else { held };
        standing
            .iter()
            .fold(0.0, |sum, end| sum + self.now_in(block, end, own))
            / standing.len() as f64
    }

    /// Where every port of the blocks inside a block is settled: for each line
    /// between two ends, where they face each other, and on each edge a lane
    /// apart in the order they want. Answers each inner block's ports' x, in
    /// its own coordinates, by block.
    fn settle_in(&self, block: &Block, own: &Map<String, f64>) -> Vec<(BlockId, Map<String, f64>)> {
        let mut wanted: Map<&str, Vec<f64>> = Map::default();
        for line in block.lines.values() {
            let ends = [line.tail.as_str(), line.head.as_str()];
            let now = self.standing(block, ends, own);
            let one = self.span_in(block, ends[0], own);
            let other = self.span_in(block, ends[1], own);
            let (x, y) = facing(one, other, now);
            for (end, at) in ends.into_iter().zip([x, y]) {
                if self.tree.pins.contains_key(end) {
                    wanted.entry(end).or_default().push(at);
                }
            }
        }
        let mut settled: Vec<(BlockId, Map<String, f64>)> = block
            .items
            .iter()
            .filter_map(|item| {
                let inner = self.tree.block_of(item)?;
                self.movable(self.tree.get(inner))
                    .then(|| (inner, self.edges_of(block, self.tree.get(inner), &wanted)))
            })
            .collect();
        separate_facing_ports(block, &mut settled, self.tree, self.laid, |inner, port| {
            self.end_span(inner, port)
        });
        settled
    }

    /// One inner block's top and bottom ports, each where its lines want it,
    /// spread a lane apart along its edge.
    fn edges_of(
        &self,
        block: &Block,
        inner: &Block,
        wanted: &Map<&str, Vec<f64>>,
    ) -> Map<String, f64> {
        let at = self.laid_of(block).boxes[inner.id.as_str()].x;
        let own = self.laid_of(inner);
        let mut ports = Map::default();
        for face in [Side::Top, Side::Bottom] {
            let mut on_face: Vec<(&str, f64)> = inner
                .ports
                .iter()
                .filter(|&(_, &side)| side == face)
                .map(|(port, _)| {
                    let pin = format!("pin:{}:{port}", inner.id);
                    let x = match wanted.get(pin.as_str()) {
                        Some(xs) => xs.iter().fold(0.0, |sum, x| sum + x) / xs.len() as f64,
                        None => middle(&own.boxes[port.as_str()]) + at,
                    };
                    (port.as_str(), x - at)
                })
                .collect();
            sort_by(&mut on_face, |one, other| one.1 - other.1);
            let spans: Vec<Span> = on_face
                .iter()
                .map(|(port, _)| self.span_of(inner, port))
                .collect();
            let span = (
                min(spans.iter().map(|span| span.0)),
                max(spans.iter().map(|span| span.1)),
            );
            let xs = spread(span, &on_face.iter().map(|(_, x)| *x).collect::<Vec<_>>());
            for ((port, _), x) in on_face.into_iter().zip(xs) {
                ports.insert(port.to_owned(), x);
            }
        }
        ports
    }

    /// Settle a block and everything inside it: route it again with its own
    /// ports where its parent settled them, after the blocks inside it. A
    /// block of cards drawn inline settles the blocks it holds first.
    fn block(&mut self, id: BlockId, own: &Map<String, f64>) {
        let tree = self.tree;
        let block = tree.get(id);
        let Some(packing) = self.packings.get(&block.id) else {
            self.cards(block, own);
            return;
        };
        let held = self.laid_of(block).width;
        self.inside(block, own);
        let mut again = PackLayout::new(tree, self.laid, block, insets_of(block));
        again.settled.clone_from(own);
        again.held = held;
        let (laid, _) = again.lay(Some(packing));
        self.laid.insert(block.id.clone(), Rc::new(laid));
    }

    /// Settle every block inside a block, where the block settles their ports.
    fn inside(&mut self, block: &Block, own: &Map<String, f64>) {
        for (inner, ports) in self.settle_in(block, own) {
            self.block(inner, &ports);
        }
    }

    /// Route a block of cards again with its own ports where its parent
    /// settled them.
    fn cards(&mut self, block: &Block, own: &Map<String, f64>) {
        let Some(reroute) = self.laid_of(block).reroute.clone() else {
            return;
        };
        if !own.is_empty() {
            let again = reroute.reroute(self.tree, self.laid, own);
            self.laid.insert(block.id.clone(), Rc::new(again));
        }
    }
}

/// Where settling stands every movable inner block's ports, walked as it
/// walks, routing nothing: each inner block's settled ports, by block.
pub(crate) fn settled_ports(settling: &Settling<'_>) -> Vec<(BlockId, Map<String, f64>)> {
    let tree = settling.tree;
    let mut out: Vec<(BlockId, Map<String, f64>)> = Vec::new();
    let mut walk: Vec<(BlockId, Map<String, f64>)> = vec![(tree.root, Map::default())];
    let mut at = 0;
    while at < walk.len() {
        let (block, own) = walk[at].clone();
        at += 1;
        let block = tree.get(block);
        if !settling.packings.contains_key(&block.id) {
            continue;
        }
        for (inner, ports) in settling.settle_in(block, &own) {
            match out.iter_mut().find(|(one, _)| *one == inner) {
                Some(found) => found.1.clone_from(&ports),
                None => out.push((inner, ports.clone())),
            }
            walk.push((inner, ports));
        }
    }
    out
}

/// Settle every port on a block's top and bottom where both ends of its line
/// are known, and route every block again with its ports there.
pub(crate) fn settle_ports(settling: &mut Settling<'_>) {
    let root = settling.tree.root;
    settling.block(root, &Map::default());
}
