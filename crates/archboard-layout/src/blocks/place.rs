//! The Track solve. Every block is laid out on its own, innermost first, so
//! its size is final before its parent places it as one box: a block of
//! cards is ranked and routed on tracks (`card_layout.rs`), its widest rank
//! wrapped into rows (`wraps.rs`) or its ranks folded into columns
//! (`fold.rs`) where that is worth taking. Last, every block is put where its
//! parent placed it and each relationship's lines are joined end to end
//! (`assembly.rs`). One solve lays the board out one way: which way its joins
//! are kept and whether a board's groups are packed are chosen where the
//! renderer runs (`solves.ts`).

use std::rc::Rc;

use crate::Graphviz;
use crate::constants::REGION_INSET;
use crate::geometry::Side;
use crate::graph::Node;
use crate::json::J;
use crate::track::route::PAGE_MARGIN;
use crate::track::scene::{Map, Set};
use crate::track::score::score_of;

use super::assembly::Assembly;
use super::card_layout::{Arrangement, CardLayout, Engine};
use super::fold::{fold_block, fold_plan};
use super::fold_layout::FoldLayout;
use super::laid::{Insets, Laid, LaidMap};
use super::laying::{Make, lay_both, settled};
use super::settle::settle_ports;
use super::sides::sides_of;
use super::stacking::{Stacking, Stood, stacked_or_not};
use super::tree::{Block, BlockId, BlockTree, Kind, Nesting};
use super::weighing::routed_weighed;
use super::wraps::{Whole, best_wrap, weighed};

/// The root option carrying the placed drawing, as the JSON the assembly answers.
const BLOCKS_PLACED: &str = "archboard.blocks.placed";
/// The root option naming how a solve draws the board's containers and group regions.
const BLOCKS_NESTING: &str = "archboard.blocks.nesting";
/// The root option naming the blocks whose joins a solve keeps apart, as a JSON list of ids.
const BLOCKS_APART: &str = "archboard.blocks.apart";
/// The root option laying a solve's first block that could stack only one way, `true` stacked.
const BLOCKS_STACKING: &str = "archboard.blocks.stacking";
/// The root option asking a solve to answer once that block is laid, `true` when asked.
const BLOCKS_UNTIL_STOOD: &str = "archboard.blocks.until-stood";
/// The root option a solve answers what that block stood at in, as JSON.
const BLOCKS_STOOD: &str = "archboard.blocks.stood";

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

/// The room a block keeps around what it holds: the page margin round the
/// board, none round a column, and a region's inset round a region, but under
/// it where a port stands on its bottom.
pub(crate) fn insets_of(block: &Block) -> Insets {
    match block.kind {
        Kind::Root => Insets {
            side: PAGE_MARGIN,
            top: PAGE_MARGIN,
            bottom: PAGE_MARGIN,
        },
        Kind::Column => Insets {
            side: 0.0,
            top: 0.0,
            bottom: 0.0,
        },
        Kind::Region => Insets {
            side: REGION_INSET,
            top: 0.0,
            bottom: if block.has_bottom_port() {
                0.0
            } else {
                REGION_INSET
            },
        },
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
        &Whole {
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

/// The way a solve's root options ask it to lay a board out.
struct Way {
    nesting: Nesting,
    apart: Set<String>,
}

/// Lay every block out, innermost first.
fn lay_all(
    gv: &mut Engine<'_>,
    graph: &Node,
    exits: Map<String, Side>,
    way: &Way,
    stacking: &mut Stacking,
) -> Result<(BlockTree, LaidMap), Stop> {
    let mut tree = BlockTree::new(graph, exits, way.nesting, &way.apart)?;
    let mut laid = LaidMap::default();
    for block in tree.innermost_first(tree.root) {
        let once = lay_cards(gv, &mut tree, block, &mut laid, stacking)?;
        laid.insert(tree.get(block).id.clone(), once);
    }
    Ok((tree, laid))
}

/// Lay a measured hierarchy out one way and route every relationship; when a
/// line's blocks do not stand the way its faces point, once more with every
/// block of its chain crossed by the edges that face each other. Last, the
/// ports on every block's top and bottom are settled where both ends of their
/// lines are known, and the blocks routed again with them there, unless the
/// drawing scores better unsettled.
fn lay_out(
    gv: &mut Engine<'_>,
    graph: &Node,
    way: &Way,
    stacking: &mut Stacking,
) -> Result<(BlockTree, LaidMap), Stop> {
    let first = lay_all(gv, graph, Map::default(), way, stacking)?;
    let exits = sides_of(&first.0, &first.1);
    let (tree, mut laid) = if exits.is_empty() {
        first
    } else {
        lay_all(gv, graph, exits, way, stacking)?
    };
    let unsettled = laid.clone();
    settle_ports(&tree, &mut laid);
    let score = |laid: &LaidMap| {
        score_of(&routed_weighed(
            &Assembly::new(&tree, laid).placed(),
            &tree.projections,
        ))
    };
    if score(&unsettled) > score(&laid) {
        for (id, one) in unsettled {
            laid.insert(id, one);
        }
    }
    Ok((tree, laid))
}

/// The way a solve's root options ask it to lay a board out, and its stacking choice.
fn way_of(graph: &Node) -> Result<(Way, Stacking), String> {
    let nesting = match graph.option(BLOCKS_NESTING).unwrap_or("inline") {
        "inline" => Nesting::Inline,
        "groups" => Nesting::Groups,
        other => {
            return Err(format!(
                "The core lays out Track boards, inline or with groups packed; {BLOCKS_NESTING} was {other}."
            ));
        }
    };
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

/// Lay a measured Track hierarchy out and route every relationship: its
/// containers and group regions drawn inline, or its groups packed as blocks
/// when its root options ask so; the joins of the blocks they name kept apart;
/// and its first block that could stack laid only the way they name, if they
/// name one, telling what that way stood at, and answering only that once it
/// is laid where they ask so. Answers the hierarchy's root as JSON, with the
/// drawing's geometry in its options.
///
/// # Errors
///
/// When the graph or its options are unreadable, or Graphviz refused a block's graph.
pub fn lay_out_track(graph: &str, host: &mut dyn Graphviz) -> Result<String, String> {
    let graph: Node = serde_json::from_str(graph)
        .map_err(|error| format!("The measured graph is unreadable: {error}"))?;
    let (way, mut stacking) = way_of(&graph)?;
    let mut gv = Engine::new(host);
    let (tree, laid) = match lay_out(&mut gv, &graph, &way, &mut stacking) {
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
    let placed = Assembly::new(&tree, &laid).placed().unstepped();
    let mut told = vec![(BLOCKS_PLACED, placed.json(false).text())];
    if let Some(stood) = &stacking.stood {
        told.push((BLOCKS_STOOD, stood.json().text()));
    }
    Ok(answer(&graph, placed.width, placed.height, told))
}
