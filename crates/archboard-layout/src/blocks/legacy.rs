//! One solve. Every block is laid out on its own, innermost first, so its
//! size is final before its parent places it as one box: a block of blocks is
//! packed and its trunks routed (`packing`); a block of cards is ranked and
//! routed on tracks (`card_layout.rs`), its widest rank wrapped into rows
//! (`wraps.rs`) or its ranks folded into columns (`fold.rs`) where that is
//! worth taking. Last, assembly places every block and joins each relationship's
//! lines through its ports (`assembly.rs`). The graph fixes the nesting,
//! acyclic entry order and fan-in labels before the one solve starts.

use std::rc::Rc;

use crate::Graphviz;
use crate::constants::{CONTAINER_INSET, REGION_INSET};
use crate::geometry::Side;
use crate::graph::Node;
use crate::track::route::PAGE_MARGIN;
use crate::track::scene::Map;
use crate::track::score::crossings_of;

use super::assembly::Assembly;
use super::card_layout::{Arrangement, CardLayout, Engine};
use super::fold::{fold_block, fold_plan};
use super::fold_layout::FoldLayout;
use super::laid::{Insets, Laid, LaidMap, corners};
use super::lone::{grown_insets, widened};
use super::orders::held_orders;
use super::packing::{PackLayout, Packing};
use super::settle::{Settling, settle_ports};
use super::sides::sides_of;
use super::tree::{Block, BlockId, BlockTree, Kept, Kind, Nesting};
use super::wraps::{Unwrapped, Wrapping, best_wrap, weighed};

/// The insets a block keeps: left and right, above its first rank, below its
/// last, grown round a container alone in its region.
pub(crate) fn insets_of(block: &Block) -> Insets {
    grown_insets(plain_insets(block), block.lone.as_ref())
}

/// The room a block keeps around what it holds, alone in no region: the page
/// margin round the board, none round a column or a cluster of loose cards,
/// and a container's or region's inset round it, but under it where a port
/// stands on its bottom.
fn plain_insets(block: &Block) -> Insets {
    let inset = match block.kind {
        Kind::Root => {
            return Insets {
                side: PAGE_MARGIN,
                top: PAGE_MARGIN,
                bottom: PAGE_MARGIN,
            };
        }
        Kind::Column => {
            return Insets {
                side: 0.0,
                top: 0.0,
                bottom: 0.0,
            };
        }
        Kind::Frame => CONTAINER_INSET,
        Kind::Region => REGION_INSET,
    };
    Insets {
        side: inset,
        top: 0.0,
        bottom: if block.has_bottom_port() { 0.0 } else { inset },
    }
}

/// Lay a card block with acyclic entry constraints, then try local rank wraps
/// and column folds. Only this block is repeated for a wrap candidate.
fn lay_cards(
    gv: &mut Engine<'_>,
    tree: &mut BlockTree,
    block: BlockId,
    laid: &mut LaidMap,
) -> Result<Rc<Laid>, String> {
    let insets = insets_of(tree.get(block));
    let whole = CardLayout::new(tree, laid, block, insets, Arrangement::default()).lay(gv)?;
    let unwrapped = Unwrapped {
        wrapping: Wrapping { laid, insets },
        whole: &whole,
    };
    if let Some(wrapped) = best_wrap(gv, tree, block, &unwrapped)? {
        return Ok(wrapped);
    }
    let walled = tree
        .get(block)
        .ports
        .values()
        .any(|side| matches!(side, Side::Left | Side::Right));
    let plan = if walled {
        None
    } else {
        fold_plan(tree.get(block), &whole, insets, &weighed(&whole))
    };
    let Some(plan) = plan else {
        return Ok(whole);
    };
    let columns = fold_block(tree, block, &plan.items);
    for &column in &columns {
        let held = CardLayout::new(
            tree,
            laid,
            column,
            insets_of(tree.get(column)),
            Arrangement::default(),
        )
        .lay(gv)?;
        laid.insert(tree.get(column).id.clone(), held);
    }
    Ok(Rc::new(
        FoldLayout::new(tree, laid, block, columns, insets).lay(),
    ))
}

/// The blocks, every block laid out, and each block of blocks' packing.
struct Board {
    tree: BlockTree,
    laid: LaidMap,
    packings: Map<String, Packing>,
}

impl Board {
    /// The board as settling reads and writes it.
    fn settling(&mut self) -> Settling<'_> {
        Settling {
            tree: &self.tree,
            laid: &mut self.laid,
            packings: &self.packings,
        }
    }
}

/// What an earlier layout decided, which a layout again keeps.
#[derive(Clone, Default)]
struct Earlier {
    /// The edge each port moves to, the ports each block holds in an order on
    /// a face.
    kept: Kept,
    /// Each block of blocks' packing.
    packings: Map<String, Packing>,
}

/// Lay one block out: packed with its child blocks as the pieces when it
/// holds child blocks alone, with no inline clusters or labels, else as cards.
/// Track packs complete parent frames here; group regions keep shared ranks.
fn lay_block(
    gv: &mut Engine<'_>,
    board: &mut Board,
    block: BlockId,
    earlier: &Earlier,
) -> Result<Rc<Laid>, String> {
    let tree = &board.tree;
    let one = tree.get(block);
    let packs = !one.items.is_empty()
        && one.clusters.is_empty()
        && one.items.iter().all(|item| {
            tree.block_of(item)
                .is_some_and(|child| tree.get(child).kind == Kind::Frame)
        })
        && !tree
            .get(block)
            .lines
            .values()
            .any(|line| line.labelled && line.edge.label_count() > 0);
    if !packs {
        return lay_cards(gv, &mut board.tree, block, &mut board.laid);
    }
    let one = tree.get(block);
    let (packed, packing) =
        PackLayout::new(tree, &board.laid, one, insets_of(one)).lay(earlier.packings.get(&one.id));
    board.packings.insert(one.id.clone(), packing);
    Ok(Rc::new(packed))
}

/// Lay every block out, innermost first. A container alone in its region
/// whose caption needs the region wider is laid out again, standing in the
/// middle of the wider region (`lone.rs`).
fn lay_all(
    gv: &mut Engine<'_>,
    graph: &Node,
    earlier: &Earlier,
    way: &Way,
) -> Result<Board, String> {
    let tree = BlockTree::new(graph, earlier.kept.clone(), way.nesting)?;
    let mut board = Board {
        tree,
        laid: LaidMap::default(),
        packings: Map::default(),
    };
    for block in board.tree.innermost_first(board.tree.root) {
        let once = lay_block(gv, &mut board, block, earlier)?;
        let wider = board
            .tree
            .get(block)
            .lone
            .as_ref()
            .and_then(|lone| widened(lone, once.width));
        let laid = match wider {
            None => once,
            Some(wider) => {
                let one = board.tree.get_mut(block);
                one.lone = Some(wider.clone());
                let id = one.id.clone();
                board.tree.lone.insert(id, wider);
                lay_block(gv, &mut board, block, earlier)?
            }
        };
        board.laid.insert(board.tree.get(block).id.clone(), laid);
    }
    Ok(board)
}

/// Settle ports after both ends are known. An unsettled overlap cannot win by drawing less ink.
fn settled_board(mut board: Board) -> Board {
    settle_ports(&mut board.settling());
    board
}

/// How often a board's lines cross, and how often they turn.
fn crossings_and_bends(board: &Board) -> (f64, f64) {
    let placed = Assembly::new(&board.tree, &board.laid).placed();
    let lines: Vec<&[_]> = placed
        .edges
        .iter()
        .map(|edge| edge.points.as_slice())
        .collect();
    let bends = lines
        .iter()
        .fold(0.0, |sum, points| sum + corners(points).len() as f64 - 2.0);
    (crossings_of(lines.iter().copied()), bends)
}

/// Lay the hierarchy, then choose the wall each route crosses from its geometry.
/// Keep a settled port order when it reduces crossings without adding bends.
/// Finally settle every port with both ends of its route known.
fn lay_out(gv: &mut Engine<'_>, graph: &Node, way: &Way) -> Result<Board, String> {
    let first = lay_all(gv, graph, &Earlier::default(), way)?;
    let exits = sides_of(&first.tree, &first.laid);
    let kept = Earlier {
        packings: first.packings.clone(),
        kept: Kept {
            exits,
            ..Kept::default()
        },
    };
    let mut last = if kept.kept.exits.is_empty() {
        first
    } else {
        lay_all(gv, graph, &kept, way)?
    };
    let orders = held_orders(&last.settling());
    if orders.is_empty() {
        return Ok(settled_board(last));
    }
    let mut held = kept;
    held.kept.orders = orders;
    let held = lay_all(gv, graph, &held, way)?;
    let (one, other) = (settled_board(last), settled_board(held));
    let ((crossings, bends), (fewer, straighter)) =
        (crossings_and_bends(&one), crossings_and_bends(&other));
    let chosen = if fewer < crossings && straighter <= bends {
        other
    } else {
        one
    };
    Ok(chosen)
}

/// The retained placement and repair policies for Track.
pub(super) fn place(
    graph: &Node,
    nesting: Nesting,
    host: &mut dyn Graphviz,
) -> Result<super::assembly::Placed, String> {
    let mut gv = Engine::new(host);
    let board = lay_out(&mut gv, graph, &Way { nesting })?;
    Ok(Assembly::new(&board.tree, &board.laid).placed().unstepped())
}

struct Way {
    nesting: Nesting,
}
