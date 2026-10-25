//! A block of cards' widest rank wrapped into rows, or its loose cards set out
//! as a grid, when that scores clearly better than the block whole (`score_of`).

use std::rc::Rc;

use crate::constants::LAYOUT_ASPECT;
use crate::ecma::{abs, sorted_by};
use crate::geometry::Rect;
use crate::track::grid::grids;
use crate::track::scene::Map;
use crate::track::score::{
    Plan, Weighed, crossings_of, score_of, scores_better, sinks, wrap_plans,
};

use super::card_layout::{Arrangement, CardLayout, Engine};
use super::laid::{Insets, Laid, LaidMap};
use super::laying::{Laying, Make, lay_both, settled};
use super::tree::{Block, BlockId, BlockTree, Kind, Nesting};

/// How much better a wrap must fit the page than the board whole.
const WORTH_WRAPPING: f64 = 1.1;
/// How much better a wrap must fit the page than a block inside the board.
const WORTH_WRAPPING_INSIDE: f64 = 1.4;
/// The fewest items a rank must hold to be wrapped.
const MIN_WRAPPED: usize = 4;

/// What a laid-out block is weighed on: its page, and its crossings with each
/// line that laps round it counted as one more.
pub(crate) fn weighed(laid: &Laid) -> Weighed {
    let crossings = crossings_of(laid.lines.values().map(Vec::as_slice)) + laid.laps.unwrap_or(0.0);
    Weighed {
        width: laid.width,
        height: laid.height,
        crossings,
        ..Weighed::default()
    }
}

/// What a block is laid out with, beside Graphviz: every block laid out so
/// far, this one whole, whether it stacks, and its insets.
pub(crate) struct Unwrapped<'a> {
    pub laid: &'a LaidMap,
    pub whole: &'a Laid,
    pub stacked: bool,
    pub insets: Insets,
}

/// The block's widest rank wrapped into rows, or its loose cards set out as a
/// grid, when that reads clearly better than the block whole.
///
/// # Errors
///
/// What Graphviz refused a wrap's graph with.
pub(crate) fn best_wrap(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    laying: &Unwrapped<'_>,
) -> Result<Option<Rc<Laid>>, String> {
    let worth = if tree.get(block).kind == Kind::Root {
        WORTH_WRAPPING
    } else {
        WORTH_WRAPPING_INSIDE
    };
    let needed = score_of(&weighed(laying.whole)) * worth;
    // No layout scores above one: a block that needs a wrap to score more keeps whole unweighed.
    if needed < 1.0 {
        wrap_scoring(gv, tree, block, laying, needed)
    } else {
        Ok(None)
    }
}

/// A wrap or grid laid out, and how many rows a wrap deals its rank into.
struct Wrapped<'t> {
    laying: Laying<'t>,
    /// How far each wrapped item is lowered; none for a grid.
    lowered: Plan,
    rows: Option<usize>,
}

/// A wrap or grid as the wrap choice weighs it.
fn wrap_of(laying: Laying<'_>, lowered: Option<Plan>) -> Wrapped<'_> {
    let rows = lowered
        .as_ref()
        .map(|lowered| 1 + lowered.values().copied().max().unwrap_or(0));
    Wrapped {
        laying,
        lowered: lowered.unwrap_or_default(),
        rows,
    }
}

/// The block's loose cards laid out as a grid, when it has enough of them.
fn grid_wrap<'t>(
    gv: &mut Engine<'_>,
    tree: &'t BlockTree,
    block: BlockId,
    laying: &Unwrapped<'t>,
) -> Result<Option<Wrapped<'t>>, String> {
    let Unwrapped {
        laid,
        stacked,
        insets,
        ..
    } = *laying;
    let loose = CardLayout::new(tree, laid, block, insets, Arrangement::default()).loose_cards();
    if !loose.iter().any(|cards| grids(cards.len())) {
        return Ok(None);
    }
    let make: Make<'t> = Rc::new(move || {
        CardLayout::new(
            tree,
            laid,
            block,
            insets,
            Arrangement {
                grid: true,
                stacked,
                ..Arrangement::default()
            },
        )
    });
    Ok(Some(wrap_of(lay_both(gv, make)?, None)))
}

/// The ways to lay one wrap of the block's widest rank out, one for each
/// choice of its columns, that sink none of its cards.
///
/// A wrap that sinks a card stands it off on a late rank, away from its
/// neighbours: it is no wrap. Where a card stands across the block is settled
/// before its lines are routed, so a wrap lined up that sinks one is not
/// routed at all.
fn lowered_wraps<'t>(
    gv: &mut Engine<'_>,
    tree: &'t BlockTree,
    block: BlockId,
    laying: &Unwrapped<'t>,
    lowered: &Plan,
) -> Result<Vec<Wrapped<'t>>, String> {
    let Unwrapped {
        laid,
        stacked,
        insets,
        ..
    } = *laying;
    let held = tree.get(block);
    let around = |card: &str| held.cluster_of.get(card).cloned();
    let mut makes: Vec<Make<'t>> = Vec::new();
    for columns in column_choices(lowered, tree.nesting) {
        let plan = lowered.clone();
        let make: Make<'t> = Rc::new(move || {
            CardLayout::new(
                tree,
                laid,
                block,
                insets,
                Arrangement {
                    lowered: plan.clone(),
                    stacked,
                    columns,
                    grid: false,
                },
            )
        });
        let mut layout = make();
        layout.clusters.keep_ties = true;
        let boxes = layout.lined(gv)?.boxes;
        if !sinks(lowered, &boxes, around) {
            makes.push(make);
        }
    }
    let mut wraps = Vec::new();
    for make in makes {
        let wrapped = wrap_of(lay_both(gv, make)?, Some(lowered.clone()));
        if !sinks(lowered, &wrapped.laying.tied.boxes, around) {
            wraps.push(wrapped);
        }
    }
    Ok(wraps)
}

/// The best of the wraps, settled, when it scores more than the block needs.
/// A wrap is chosen with its titles tied; only the chosen one is laid again
/// with them pulled down, and kept so unless that sinks a card.
fn settled_best(
    gv: &mut Engine<'_>,
    held: &Block,
    chosen: Vec<Wrapped<'_>>,
    needed: f64,
) -> Result<Option<Rc<Laid>>, String> {
    let mut best: Option<Wrapped<'_>> = None;
    for other in chosen {
        if best.as_ref().is_none_or(|one| wraps_better(&other, one)) {
            best = Some(other);
        }
    }
    let Some(best) = best else {
        return Ok(None);
    };
    if score_of(&weighed(&best.laying.tied)) <= needed {
        return Ok(None);
    }
    let kept = settled(gv, &best.laying)?;
    let around = |card: &str| held.cluster_of.get(card).cloned();
    let sunk = sinks(&best.lowered, &kept.boxes, around);
    Ok(Some(if sunk {
        Rc::clone(&best.laying.tied)
    } else {
        kept
    }))
}

/// The block's best wrap or grid, when it scores more than the block needs.
fn wrap_scoring(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    laying: &Unwrapped<'_>,
    needed: f64,
) -> Result<Option<Rc<Laid>>, String> {
    let mut chosen: Vec<Wrapped<'_>> = grid_wrap(gv, tree, block, laying)?.into_iter().collect();
    for lowered in wraps_of(laying.whole, tree, block) {
        chosen.extend(lowered_wraps(gv, tree, block, laying, &lowered)?);
    }
    settled_best(gv, tree.get(block), chosen, needed)
}

/// Whether one wrap reads better than another: it scores higher, or, as well,
/// deals its rank into fewer rows.
fn wraps_better(one: &Wrapped<'_>, other: &Wrapped<'_>) -> bool {
    let (mine, theirs) = (weighed(&one.laying.tied), weighed(&other.laying.tied));
    let tied = abs(score_of(&mine) - score_of(&theirs)) <= 1e-9;
    if tied
        && let (Some(rows), Some(theirs)) = (one.rows, other.rows)
        && rows != theirs
    {
        return rows < theirs;
    }
    scores_better(&mine, &theirs)
}

/// Whether a wrap's rows may be laid with their columns free, as well as held.
/// Left free, a lowered card is pushed aside by the lines to every row below
/// it, so on the track engine's ranks a wrap deeper than two rows keeps its
/// columns. The blocks engine packs such a block among others, where holding
/// its columns drew more crossings than it saved.
fn column_choices(lowered: &Plan, nesting: Nesting) -> Vec<bool> {
    let deep = lowered.values().copied().max().unwrap_or(0) > 1;
    if deep && nesting != Nesting::Blocks {
        vec![true]
    } else {
        vec![false, true]
    }
}

/// The ways to wrap a block's widest rank of items into rows, when the block
/// is wider than the page's shape. Interchangeable cards standing together
/// stay in one row.
fn wraps_of(whole: &Laid, tree: &BlockTree, block: BlockId) -> Vec<Plan> {
    let bands: Vec<_> = whole
        .bands
        .iter()
        .filter(|band| band.items.len() >= MIN_WRAPPED)
        .collect();
    if bands.is_empty() || whole.width / whole.height <= LAYOUT_ASPECT {
        return Vec::new();
    }
    let widest = bands.iter().skip(1).fold(bands[0], |one, &other| {
        if other.items.len() > one.items.len() {
            other
        } else {
            one
        }
    });
    let across = sorted_by(&widest.items, |one, other| {
        whole.boxes[one.as_str()].x - whole.boxes[other.as_str()].x
    });
    let held = tree.get(block);
    let runs = peer_runs(&across, &whole.boxes, |id| {
        let peers = tree.cards.get(id)?.peers.as_ref()?;
        Some(format!(
            "{}|{peers}",
            held.cluster_of.get(id).map_or("", String::as_str)
        ))
    });
    wrap_plans(&runs)
        .into_iter()
        .filter(|plan| {
            runs.iter()
                .all(|(ids, _)| ids.iter().all(|id| plan.get(id) == plan.get(&ids[0])))
        })
        .collect()
}

/// A rank's items, left to right, in runs that stand together: neighbouring
/// peers make one run, every other item a run of its own, each with its width.
fn peer_runs(
    across: &[String],
    boxes: &Map<String, Rect>,
    peers_of: impl Fn(&str) -> Option<String>,
) -> Vec<(Vec<String>, f64)> {
    let mut runs: Vec<(Option<String>, Vec<String>, f64)> = Vec::new();
    for id in across {
        let peers = peers_of(id);
        let at = boxes[id.as_str()];
        match runs.last_mut() {
            Some((last, ids, width)) if peers.is_some() && *last == peers => {
                ids.push(id.clone());
                *width = at.x + at.width - boxes[ids[0].as_str()].x;
            }
            _ => runs.push((peers, vec![id.clone()], at.width)),
        }
    }
    runs.into_iter()
        .map(|(_, ids, width)| (ids, width))
        .collect()
}
