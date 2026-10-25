//! The ways a block of blocks may be packed whose lines, held whole in it,
//! run away from their ends little more than in the way they run away least
//! (ADR 0039, `weighing.rs`). A packing is weighed before the board's second
//! layout turns its lines to the walls their blocks face each other by
//! (`sides.rs`), so the least is partly lines that will not stay where they
//! run; the room grows with it.

use crate::geometry::{Point, Rect};
use crate::track::scene::Map;

use super::super::laid::{Laid, LaidMap, corners, moved, shifted};
use super::super::tree::{Block, BlockId, BlockTree, Projection};
use super::super::weighing::runs_away;

/// How many times as far a packing's lines may run away from their ends as in
/// the packing whose lines run away least, and `AWAY_MARGIN` more, and still
/// be weighed.
const AWAY_FACTOR: f64 = 4.0;
/// How many crossings' worth further than `AWAY_FACTOR` allows a packing's
/// lines may run away from their ends and still be weighed. Only a packing
/// whose lines loop round its blocks is set aside: beside Client access and
/// ingress, TLS termination (Azure deployment internals, Blocks) sent the
/// lines into it out and over the top of the picture.
const AWAY_MARGIN: f64 = 4.0;

/// The lines a block holds whole, joined through the blocks inside it as they
/// are laid out so far, the block itself laid out the way weighed.
struct HeldWhole<'a> {
    tree: &'a BlockTree,
    laid: &'a LaidMap,
    block: &'a Block,
    candidate: &'a Laid,
    /// Where each block inside the block stands in it.
    origins: Map<String, Point>,
}

impl<'a> HeldWhole<'a> {
    /// Place every block inside the block.
    fn new(
        tree: &'a BlockTree,
        laid: &'a LaidMap,
        block: &'a Block,
        candidate: &'a Laid,
    ) -> HeldWhole<'a> {
        let mut held = HeldWhole {
            tree,
            laid,
            block,
            candidate,
            origins: Map::default(),
        };
        held.origins
            .insert(block.id.clone(), Point { x: 0.0, y: 0.0 });
        held.descend(block);
        held
    }

    /// A block laid out: the block weighed the way weighed, else as laid out so far.
    fn laid_of(&self, one: &Block) -> Option<&'a Laid> {
        if std::ptr::eq(one, self.block) {
            Some(self.candidate)
        } else {
            self.laid.get(one.id.as_str()).map(AsRef::as_ref)
        }
    }

    /// Give the blocks inside one block their origins, and those inside them.
    fn descend(&mut self, outer: &Block) {
        let tree = self.tree;
        for item in &outer.items {
            let (Some(inner), Some(at)) = (
                tree.block_of(item),
                self.laid_of(outer).and_then(|laid| laid.boxes.get(item)),
            ) else {
                continue;
            };
            let origin = moved(*at, self.origins[outer.id.as_str()]);
            self.origins.insert(
                item.clone(),
                Point {
                    x: origin.x,
                    y: origin.y,
                },
            );
            self.descend(tree.get(inner));
        }
    }

    /// Where a line's end stands: its box in the first of some blocks that holds it.
    fn end_in(&self, blocks: &[BlockId], id: &str) -> Option<Rect> {
        blocks.iter().find_map(|&one| {
            let one = self.tree.get(one);
            let at = self.laid_of(one)?.boxes.get(id)?;
            Some(moved(*at, self.origins[one.id.as_str()]))
        })
    }

    /// One relationship's line, joined through every block it passes, and its
    /// ends; nothing unless the block holds it whole and both ends are laid out.
    fn line_of(&self, projection: &Projection) -> Option<(Vec<Point>, (Rect, Rect))> {
        if !std::ptr::eq(self.tree.get(projection.at), self.block) {
            return None;
        }
        let leaving: Vec<BlockId> = projection
            .out
            .iter()
            .copied()
            .chain([projection.at])
            .collect();
        let entering: Vec<BlockId> = projection
            .into
            .iter()
            .copied()
            .chain([projection.at])
            .collect();
        let from = self.end_in(&leaving, projection.edge.source())?;
        let to = self.end_in(&entering, projection.edge.target())?;
        let mut points = Vec::new();
        for (one, key) in self
            .tree
            .routes
            .get(projection.edge.id.as_str())
            .map_or(&[][..], |route| route.pieces.as_slice())
        {
            let one = self.tree.get(*one);
            let origin = self
                .origins
                .get(one.id.as_str())
                .copied()
                .unwrap_or(Point { x: 0.0, y: 0.0 });
            if let Some(line) = self.laid_of(one).and_then(|laid| laid.lines.get(key)) {
                points.extend(shifted(line, origin));
            }
        }
        Some((corners(&points), (from, to)))
    }
}

/// The ways a block of blocks may be laid out whose lines, held whole in it,
/// run away from their ends little more than in the way they run away least.
/// Answers the indices of the ways kept, in their order.
pub(super) fn nearest_away(
    tree: &BlockTree,
    laid: &LaidMap,
    block: &Block,
    ways: &[&Laid],
) -> Vec<usize> {
    let away: Vec<f64> = ways
        .iter()
        .map(|way| {
            let held = HeldWhole::new(tree, laid, block, way);
            let lines: Vec<(Vec<Point>, (Rect, Rect))> = tree
                .projections
                .iter()
                .filter_map(|projection| held.line_of(projection))
                .collect();
            runs_away(
                lines
                    .iter()
                    .map(|(points, ends)| (points.as_slice(), *ends)),
            )
        })
        .collect();
    let least = crate::ecma::min(away.iter().copied());
    (0..ways.len())
        .filter(|&index| away[index] <= AWAY_FACTOR * least + AWAY_MARGIN)
        .collect()
}
