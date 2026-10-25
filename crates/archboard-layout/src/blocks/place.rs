//! One solve. Every block is laid out on its own, innermost first, so its
//! size is final before its parent places it as one box: a block of blocks is
//! packed and its trunks routed (`packing`); a block of cards is ranked and
//! routed on tracks (`card_layout.rs`), its widest rank wrapped into rows
//! (`wraps.rs`) or its ranks folded into columns (`fold.rs`) where that is
//! worth taking. Last, every block is put where its parent placed it and each
//! relationship's lines are joined end to end (`assembly.rs`). One solve lays
//! the board out one way: how its containers and group regions are drawn,
//! which way its joins are kept and whether its blocks face their walls are
//! chosen between solves (`architecture::choosing`).

use std::rc::Rc;

use crate::Graphviz;
use crate::constants::{CONTAINER_INSET, REGION_INSET};
use crate::geometry::Side;
use crate::graph::Node;
use crate::json::J;
use crate::track::route::PAGE_MARGIN;
use crate::track::scene::{Map, Set};
use crate::track::score::{crossings_of, score_of};

use super::assembly::Assembly;
use super::card_layout::{Arrangement, CardLayout, Engine};
use super::choosing::reading_of;
use super::fold::{fold_block, fold_plan};
use super::fold_layout::FoldLayout;
use super::laid::{Insets, Laid, LaidMap, corners};
use super::laying::{Make, lay_both, settled};
use super::lone::{grown_insets, widened};
use super::orders::held_orders;
use super::packing::{PackLayout, Packing};
use super::settle::{Settling, settle_ports};
use super::sides::sides_of;
use super::stacking::{Stacking, Stood, stacked_or_not};
use super::tree::{Block, BlockId, BlockTree, Kept, Kind, Nesting};
use super::walls::facing_turns;
use super::weighing::routed_weighed;
use super::wraps::{Unwrapped, best_wrap, weighed};

/// The root option carrying the placed drawing, as the JSON the assembly answers.
pub(crate) const BLOCKS_PLACED: &str = "archboard.blocks.placed";
/// The root option carrying what the renderer's choices between solves read
/// of the drawing (`choosing.rs`), as JSON only the core reads.
pub(crate) const BLOCKS_READING: &str = "archboard.blocks.reading";
/// The root option asking a solve to tell its drawing's reading, `true` when
/// asked: only a drawing a choice weighs needs one, and reading a drawing
/// costs about as much as routing a small one.
pub(crate) const BLOCKS_READ: &str = "archboard.blocks.read";
/// The root option naming how a solve draws the board's containers and group regions.
pub(crate) const BLOCKS_NESTING: &str = "archboard.blocks.nesting";
/// The root option naming the blocks whose joins a solve keeps apart, as a JSON list of ids.
pub(crate) const BLOCKS_APART: &str = "archboard.blocks.apart";
/// The root option asking a solve to face every block's walls, `true` when asked.
pub(crate) const BLOCKS_FACING: &str = "archboard.blocks.facing";
/// The root option laying a solve's first block that could stack only one way, `true` stacked.
pub(crate) const BLOCKS_STACKING: &str = "archboard.blocks.stacking";
/// The root option asking a solve to answer once that block is laid, `true` when asked.
pub(crate) const BLOCKS_UNTIL_STOOD: &str = "archboard.blocks.until-stood";
/// The root option a solve answers what that block stood at in, as JSON.
pub(crate) const BLOCKS_STOOD: &str = "archboard.blocks.stood";

/// What ends a solve early: what its first block that could stack stood at,
/// when it was asked to answer once that block is laid, or what went wrong.
pub(crate) enum Stop {
    Stood(Box<Stood>),
    Failed(String),
}

impl From<String> for Stop {
    fn from(error: String) -> Stop {
        Stop::Failed(error)
    }
}

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

/// Lay one block of cards out: whole, stacked or not, its widest rank wrapped
/// into rows when that reads clearly better, or folded into columns when that
/// does. The columns are added to `laid`.
fn lay_cards(
    gv: &mut Engine<'_>,
    tree: &mut BlockTree,
    block: BlockId,
    laid: &mut LaidMap,
    stacking: &mut Stacking,
) -> Result<Rc<Laid>, Stop> {
    let insets = insets_of(tree.get(block));
    let (whole, stacked) = stacked_or_not(gv, tree, block, laid, insets, stacking)?;
    if let Some(wrapped) = best_wrap(
        gv,
        tree,
        block,
        &Unwrapped {
            laid,
            whole: &whole,
            stacked,
            insets,
        },
    )? {
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
        let held = {
            let (tree, laid) = (&*tree, &*laid);
            let inset = insets_of(tree.get(column));
            let make: Make<'_> = Rc::new(move || {
                CardLayout::new(
                    tree,
                    laid,
                    column,
                    inset,
                    Arrangement {
                        stacked,
                        ..Arrangement::default()
                    },
                )
            });
            let laying = lay_both(gv, make)?;
            settled(gv, &laying)?
        };
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
    /// a face, and whether every block faces the walls its lines cross.
    kept: Kept,
    /// Each block of blocks' packing.
    packings: Map<String, Packing>,
}

/// Lay one block out: packed with its child blocks as the pieces when it
/// holds any and the board's blocks are packed, else as cards.
fn lay_block(
    gv: &mut Engine<'_>,
    board: &mut Board,
    block: BlockId,
    earlier: &Earlier,
    stacking: &mut Stacking,
) -> Result<Rc<Laid>, Stop> {
    let tree = &board.tree;
    let packs = tree.nesting == Nesting::Blocks
        && tree.get(block).items.iter().any(|item| tree.is_block(item));
    if !packs {
        return lay_cards(gv, &mut board.tree, block, &mut board.laid, stacking);
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
    stacking: &mut Stacking,
) -> Result<Board, Stop> {
    let tree = BlockTree::new(graph, earlier.kept.clone(), way.nesting, &way.apart)?;
    let mut board = Board {
        tree,
        laid: LaidMap::default(),
        packings: Map::default(),
    };
    for block in board.tree.innermost_first(board.tree.root) {
        let once = lay_block(gv, &mut board, block, earlier, stacking)?;
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
                lay_block(gv, &mut board, block, earlier, stacking)?
            }
        };
        board.laid.insert(board.tree.get(block).id.clone(), laid);
    }
    Ok(board)
}

/// A layout with its ports settled, unless the drawing scores better
/// unsettled on its lines as the blocks route them, before the steps they
/// need not take are taken out: the room its routes run round what they pass
/// counted as crossings at the trunk router's rate, and so is each line's run
/// away from its ends (`weighing.rs`).
fn settled_or_not(mut board: Board) -> Board {
    let unsettled = board.laid.clone();
    settle_ports(&mut board.settling());
    let score = |laid: &LaidMap| {
        score_of(&routed_weighed(
            &Assembly::new(&board.tree, laid).placed(),
            &board.tree.projections,
        ))
    };
    if score(&unsettled) > score(&board.laid) {
        for (id, one) in unsettled {
            board.laid.insert(id, one);
        }
    }
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

/// Whether facing every block's walls would change a board's blocks. Only
/// Blocks faces them: drawn inline, no drawing of either vault changed by
/// facing them.
fn faces_of(graph: &Node, exits: &Map<String, Side>, way: &Way) -> Result<bool, String> {
    if way.nesting != Nesting::Blocks || exits.is_empty() {
        return Ok(false);
    }
    let kept = Kept {
        exits: exits.clone(),
        facing: true,
        ..Kept::default()
    };
    Ok(facing_turns(&BlockTree::new(
        graph,
        kept,
        way.nesting,
        &way.apart,
    )?))
}

/// Lay a measured hierarchy out one way and route every relationship; when a
/// line's blocks do not stand the way its faces point, once more with every
/// block of its chain crossed by the edges that face each other
/// (`sides.rs`), and every block facing its walls when asked. Where settling
/// would swap ports on a block of cards' face, once more with those ports
/// held in the settled order (`orders.rs`), kept where it crosses fewer
/// lines. Not while a join is parted: the joins choice would then prefer a
/// parted drawing that runs a line round a block. Last, the ports on every
/// block's top and bottom are settled where both ends of their lines are
/// known, and the blocks routed again with them there. Answers the board and
/// whether facing every block's walls changes it.
fn lay_out(
    gv: &mut Engine<'_>,
    graph: &Node,
    way: &Way,
    stacking: &mut Stacking,
) -> Result<(Board, bool), Stop> {
    let first = lay_all(gv, graph, &Earlier::default(), way, stacking)?;
    let exits = sides_of(&first.tree, &first.laid);
    let faces = faces_of(graph, &exits, way)?;
    let kept = Earlier {
        packings: first.packings.clone(),
        kept: Kept {
            facing: way.facing && faces,
            exits,
            ..Kept::default()
        },
    };
    let mut last = if kept.kept.exits.is_empty() {
        first
    } else {
        lay_all(gv, graph, &kept, way, stacking)?
    };
    let orders = if way.apart.is_empty() {
        held_orders(&last.settling())
    } else {
        Map::default()
    };
    if orders.is_empty() {
        return Ok((settled_or_not(last), faces));
    }
    let mut held = kept;
    held.kept.orders = orders;
    let held = lay_all(gv, graph, &held, way, stacking)?;
    let (one, other) = (settled_or_not(last), settled_or_not(held));
    let ((crossings, bends), (fewer, straighter)) =
        (crossings_and_bends(&one), crossings_and_bends(&other));
    let chosen = if fewer < crossings && straighter <= bends {
        other
    } else {
        one
    };
    Ok((chosen, faces))
}

/// The way a solve's root options ask it to lay a board out.
struct Way {
    nesting: Nesting,
    apart: Set<String>,
    facing: bool,
}

/// The way a solve's root options ask it to lay a board out, and its stacking choice.
fn way_of(graph: &Node) -> Result<(Way, Stacking), String> {
    let nesting = Nesting::named(graph.option(BLOCKS_NESTING).unwrap_or("inline"))?;
    let apart: Vec<String> = serde_json::from_str(graph.option(BLOCKS_APART).unwrap_or("[]"))
        .map_err(|error| format!("{BLOCKS_APART} is unreadable: {error}"))?;
    let way = match graph.option(BLOCKS_STACKING) {
        None => None,
        Some("true") => Some(true),
        Some("false") => Some(false),
        Some(other) => {
            return Err(format!(
                "{BLOCKS_STACKING} is true or false; it was {other}."
            ));
        }
    };
    let stacking = Stacking {
        way,
        until: graph.option(BLOCKS_UNTIL_STOOD) == Some("true"),
        stood: None,
    };
    Ok((
        Way {
            nesting,
            apart: apart.into_iter().collect(),
            facing: graph.option(BLOCKS_FACING) == Some("true"),
        },
        stacking,
    ))
}

/// A solve's answer: the hierarchy's root, as large as the drawing, carrying it in its options.
fn answer(graph: &Node, width: f64, height: f64, told: Vec<(&str, String)>) -> String {
    let mut options = graph.layout_options.clone().unwrap_or_default();
    for (name, value) in told {
        options.insert(name.to_owned(), value);
    }
    J::obj([
        ("id", J::str(&graph.id)),
        ("x", J::Num(0.0)),
        ("y", J::Num(0.0)),
        ("width", J::Num(width)),
        ("height", J::Num(height)),
        (
            "layoutOptions",
            J::Obj(
                options
                    .into_iter()
                    .map(|(name, value)| (name, J::Str(value)))
                    .collect(),
            ),
        ),
    ])
    .text()
}

/// Lay a measured hierarchy out and route every relationship: its containers
/// and group regions packed as blocks, drawn inline, or inline with its
/// groups packed, as its root options name (inline when they name none); the
/// joins of the blocks they name kept apart; every block facing its walls
/// when they ask so; and its first block that could stack laid only the way
/// they name, if they name one, telling what that way stood at, and answering
/// only that once it is laid where they ask so. Answers the hierarchy's root
/// as JSON, with the drawing's geometry in its options.
///
/// # Errors
///
/// When the graph or its options are unreadable, or Graphviz refused a block's graph.
pub fn lay_out_board(graph: &str, host: &mut dyn Graphviz) -> Result<String, String> {
    let graph: Node = serde_json::from_str(graph)
        .map_err(|error| format!("The measured graph is unreadable: {error}"))?;
    let (way, mut stacking) = way_of(&graph)?;
    let mut gv = Engine::new(host);
    let (board, faces) = match lay_out(&mut gv, &graph, &way, &mut stacking) {
        Ok(laid_out) => laid_out,
        Err(Stop::Stood(stood)) => {
            return Ok(answer(
                &graph,
                0.0,
                0.0,
                vec![(BLOCKS_STOOD, stood.json().text())],
            ));
        }
        Err(Stop::Failed(error)) => return Err(error),
    };
    let placed = Assembly::new(&board.tree, &board.laid).placed().unstepped();
    let mut told = vec![(BLOCKS_PLACED, placed.json(faces).text())];
    if graph.option(BLOCKS_READ) == Some("true") {
        let reading = serde_json::to_string(&reading_of(&placed, &board.tree.projections))
            .map_err(|error| format!("A drawing's reading cannot be told: {error}"))?;
        told.push((BLOCKS_READING, reading));
    }
    if let Some(stood) = &stacking.stood {
        told.push((BLOCKS_STOOD, stood.json().text()));
    }
    Ok(answer(&graph, placed.width, placed.height, told))
}
