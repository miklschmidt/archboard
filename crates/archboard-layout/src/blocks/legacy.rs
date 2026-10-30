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
    let mut insets = grown_insets(plain_insets(block), block.lone.as_ref());
    insets.side += block.routing_room;
    insets.top += block.routing_room;
    insets.bottom += block.routing_room;
    insets
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
        Kind::Column | Kind::Cluster => {
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
            tree.block_of(item).is_some_and(|child| {
                tree.nesting == Nesting::Blocks || tree.get(child).kind == Kind::Frame
            })
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
    let mut tree = BlockTree::new(
        graph,
        Kept {
            expanded: way.expanded,
            ..earlier.kept.clone()
        },
        way.nesting,
    )?;
    reserve_room(&mut tree, way);
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

/// The retained placement path for Track and unmigrated Blocks classes.
pub(super) fn place(
    graph: &Node,
    nesting: Nesting,
    host: &mut dyn Graphviz,
) -> Result<super::assembly::Placed, String> {
    let mut gv = Engine::new(host);
    let board = lay_out(
        &mut gv,
        graph,
        &Way {
            nesting,
            expanded: false,
            room: Vec::new(),
            extra: 0.0,
        },
    )?;
    Ok(Assembly::new(&board.tree, &board.laid).placed().unstepped())
}

/// Legacy placements, with port settlement deferred until the first plans fail.
pub(super) struct Candidates {
    ready: std::vec::IntoIter<super::assembly::Placed>,
    unsettled: Option<Vec<Board>>,
    seen: rustc_hash::FxHashSet<String>,
}

fn drawings(boards: &[Board]) -> std::vec::IntoIter<super::assembly::Placed> {
    let mut drawings: Vec<_> = boards
        .iter()
        .map(|board| Assembly::new(&board.tree, &board.laid).placed())
        .collect();
    drawings.sort_by(|a, b| (a.width * a.height).total_cmp(&(b.width * b.height)));
    drawings.into_iter()
}

impl Iterator for Candidates {
    type Item = super::assembly::Placed;
    fn next(&mut self) -> Option<Self::Item> {
        for next in self.ready.by_ref() {
            // The planner reads the provisional routes as well as the card positions.
            if self.seen.insert(next.json().text()) {
                return Some(next);
            }
        }
        let settled: Vec<_> = self
            .unsettled
            .take()?
            .into_iter()
            .map(settled_board)
            .collect();
        self.ready = drawings(&settled);
        self.next()
    }
}

pub(super) fn candidates(
    graph: &Node,
    host: &mut dyn Graphviz,
    room: &[String],
    extra: f64,
) -> Result<Candidates, String> {
    let mut graph = graph.clone();
    for edge in graph.edges.iter_mut().flatten() {
        if let Some(options) = Rc::make_mut(edge).layout_options.as_mut() {
            options.shift_remove("archboard.relationship.emphasis");
            options.shift_remove("archboard.relationship.traffic");
        }
    }
    let mut gv = Engine::new(host);
    let way = Way {
        nesting: Nesting::Blocks,
        expanded: false,
        room: room.to_vec(),
        extra,
    };
    let mut first = lay_all(&mut gv, &graph, &Earlier::default(), &way)?;
    let orders = held_orders(&first.settling());
    let packings = first.packings.clone();
    let ordered = if orders.is_empty() {
        None
    } else {
        Some(lay_all(
            &mut gv,
            &graph,
            &Earlier {
                packings,
                kept: Kept {
                    orders,
                    ..Kept::default()
                },
            },
            &way,
        )?)
    };
    let alternatives = alternative_hierarchies(&mut gv, &graph, &way)?;
    let mut unsettled: Vec<_> = std::iter::once(first).chain(ordered).collect();
    let area = |board: &Board| {
        let root = &board.laid[&board.tree.get(board.tree.root).id];
        root.width * root.height
    };
    unsettled.sort_by(|a, b| area(a).total_cmp(&area(b)));
    let best = unsettled.remove(0);
    let mut ready = vec![Assembly::new(&best.tree, &best.laid).placed()];
    let best = settled_board(best);
    ready.push(Assembly::new(&best.tree, &best.laid).placed());
    ready.extend(drawings(&unsettled));
    ready.sort_by(|a, b| (a.width * a.height).total_cmp(&(b.width * b.height)));
    ready.extend(drawings(&alternatives));
    unsettled.extend(alternatives);
    Ok(Candidates {
        ready: ready.into_iter(),
        unsettled: Some(unsettled),
        seen: rustc_hash::FxHashSet::default(),
    })
}

/// Offer wider wraps with both provisional label rows and compact card-only ranks.
/// The final planner places the original measured labels on guarded routes.
fn alternative_hierarchies(
    gv: &mut Engine<'_>,
    graph: &Node,
    way: &Way,
) -> Result<Vec<Board>, String> {
    // Dense first attempts keep their small search. A refused placement also
    // needs these existing alternatives during the two bounded room repairs.
    if !super::planned::refines(graph) && way.extra == 0.0 {
        return Ok(Vec::new());
    }
    let mut candidates = expanded_candidates(gv, graph, way)?;
    if graph
        .edges
        .iter()
        .flatten()
        .any(|edge| edge.label_count() > 0)
    {
        let mut compact = graph.clone();
        for edge in compact.edges.iter_mut().flatten() {
            Rc::make_mut(edge).labels = None;
        }
        candidates.extend(expanded_candidates(gv, &compact, way)?);
    }
    Ok(candidates)
}

/// Compare the wider wrap search with axial frame approaches and its settled port order.
fn expanded_candidates(gv: &mut Engine<'_>, graph: &Node, way: &Way) -> Result<Vec<Board>, String> {
    let way = Way {
        expanded: true,
        ..way.clone()
    };
    let mut earlier = Earlier::default();
    let mut expanded = lay_all(gv, graph, &earlier, &way)?;
    earlier.kept.orders = held_orders(&expanded.settling());
    earlier.packings.clone_from(&expanded.packings);
    let mut candidates = vec![expanded];
    if !earlier.kept.orders.is_empty() {
        candidates.push(lay_all(gv, graph, &earlier, &way)?);
    }
    Ok(candidates)
}

#[derive(Clone)]
struct Way {
    nesting: Nesting,
    expanded: bool,
    room: Vec<String>,
    extra: f64,
}

fn reserve_room(tree: &mut BlockTree, way: &Way) {
    let mut affected = rustc_hash::FxHashSet::default();
    for node in &way.room {
        if let Some(&id) = tree.blocks.get(node) {
            affected.insert(id);
        }
        // A route also needs room outside every enclosing block, up to the page.
        affected.extend(tree.above(node));
    }
    for block in affected {
        tree.get_mut(block).routing_room = way.extra;
    }
}
