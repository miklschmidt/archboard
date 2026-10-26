//! A block of cards' widest rank wrapped into rows, or its loose cards set out
//! as a grid, when that scores clearly better than the block whole (`score_of`).
//!
//! The search lays its candidates out one after another. The search of the
//! first block of a solve that could stack can instead be split between
//! solves (`architecture::choosing`): the partial solve that lays that block
//! tells its search (`Search`), one solve lays the board with no wrap there,
//! and one solve for each candidate tries that candidate alone (`only_wrap`).
//! The renderer then keeps the candidate this search would keep (`kept_of`).

use std::rc::Rc;

use serde::{Deserialize, Serialize};

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

/// What a block's wraps are laid out with, beside Graphviz: every block laid
/// out so far, whether it stacks, and its insets.
#[derive(Clone, Copy)]
pub(crate) struct Wrapping<'a> {
    pub laid: &'a LaidMap,
    pub stacked: bool,
    pub insets: Insets,
}

/// What a block's wrap search starts from: what its wraps are laid out with,
/// and the block laid out whole.
pub(crate) struct Unwrapped<'a> {
    pub wrapping: Wrapping<'a>,
    pub whole: &'a Laid,
}

/// One wrap the search tries: the block's loose cards set out as a grid, or
/// its widest rank dealt into rows as a plan lowers it, the rows' columns
/// held or free.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Candidate {
    Grid,
    Lowered { lowered: Plan, columns: bool },
}

/// A block's wrap search: the score a wrap must beat, and the candidates in
/// the order the search weighs them.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub(crate) struct Search {
    pub needed: f64,
    pub candidates: Vec<Candidate>,
}

/// One candidate of a wrap search tried alone, and the score it must beat to be kept.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub(crate) struct Tried {
    pub candidate: Candidate,
    pub needed: f64,
}

/// What trying one candidate alone gave: what the search weighs it on, and
/// the block laid out with it where it scores more than the block needs.
pub(crate) type Alone = (Weighing, Option<Rc<Laid>>);

/// What the search weighs a wrap that sinks no card on: the wrap with its
/// titles tied, and how many rows it deals its rank into (none for a grid).
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub(crate) struct Weighing {
    pub weighed: Weighed,
    pub rows: Option<usize>,
}

/// The wrap search of a block laid out whole. Nothing when no wrap could
/// score what the block needs, or when the block has no candidate.
pub(crate) fn search_of(
    tree: &BlockTree,
    block: BlockId,
    laying: &Unwrapped<'_>,
) -> Option<Search> {
    let worth = if tree.get(block).kind == Kind::Root {
        WORTH_WRAPPING
    } else {
        WORTH_WRAPPING_INSIDE
    };
    let needed = score_of(&weighed(laying.whole)) * worth;
    // No layout scores above one: a block that needs a wrap to score more keeps whole unweighed.
    if needed >= 1.0 {
        return None;
    }
    let Wrapping { laid, insets, .. } = laying.wrapping;
    let loose = CardLayout::new(tree, laid, block, insets, Arrangement::default()).loose_cards();
    let mut candidates = Vec::new();
    if loose.iter().any(|cards| grids(cards.len())) {
        candidates.push(Candidate::Grid);
    }
    for lowered in wraps_of(laying.whole, tree, block) {
        for columns in column_choices(&lowered, tree.nesting) {
            candidates.push(Candidate::Lowered {
                lowered: lowered.clone(),
                columns,
            });
        }
    }
    (!candidates.is_empty()).then_some(Search { needed, candidates })
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
    let Some(search) = search_of(tree, block, laying) else {
        return Ok(None);
    };
    let mut tried_out = Vec::new();
    for candidate in &search.candidates {
        tried_out.push(tried(gv, tree, block, laying.wrapping, candidate)?);
    }
    let weighings: Vec<Option<Weighing>> = tried_out
        .iter()
        .map(|wrapped| wrapped.as_ref().map(Wrapped::weighing))
        .collect();
    let Some(best) = kept_of(search.needed, &weighings).and_then(|at| tried_out[at].as_ref())
    else {
        return Ok(None);
    };
    Ok(Some(settled_wrap(gv, tree.get(block), best)?))
}

/// One candidate tried alone: what the search weighs it on, and the block
/// laid out with it, as the search keeps it, where it scores more than the
/// block needs; nothing when it sinks a card. A candidate that scores no
/// more is never kept, whatever the others score.
///
/// # Errors
///
/// What Graphviz refused the wrap's graph with.
pub(crate) fn only_wrap(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    wrapping: Wrapping<'_>,
    alone: &Tried,
) -> Result<Option<Alone>, String> {
    let Some(wrapped) = tried(gv, tree, block, wrapping, &alone.candidate)? else {
        return Ok(None);
    };
    let weighing = wrapped.weighing();
    let laid = if score_of(&weighing.weighed) > alone.needed {
        Some(settled_wrap(gv, tree.get(block), &wrapped)?)
    } else {
        None
    };
    Ok(Some((weighing, laid)))
}

/// Which candidate the search keeps, from what it weighs each candidate that
/// sinks no card on, in the order it weighs them: the best one, when it
/// scores more than the block needs.
pub(crate) fn kept_of(needed: f64, weighings: &[Option<Weighing>]) -> Option<usize> {
    let mut best: Option<(usize, &Weighing)> = None;
    for (at, other) in weighings.iter().enumerate() {
        let Some(other) = other else { continue };
        if best.is_none_or(|(_, one)| wraps_better(other, one)) {
            best = Some((at, other));
        }
    }
    let (at, best) = best?;
    (score_of(&best.weighed) > needed).then_some(at)
}

/// A wrap or grid laid out, and how many rows a wrap deals its rank into.
struct Wrapped<'t> {
    laying: Laying<'t>,
    /// How far each wrapped item is lowered; none for a grid.
    lowered: Plan,
    rows: Option<usize>,
}

impl Wrapped<'_> {
    /// What the search weighs it on.
    fn weighing(&self) -> Weighing {
        Weighing {
            weighed: weighed(&self.laying.tied),
            rows: self.rows,
        }
    }
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

/// One candidate laid out, unless it sinks a card.
///
/// A wrap that sinks a card stands it off on a late rank, away from its
/// neighbours: it is no wrap. Where a card stands across the block is settled
/// before its lines are routed, so a wrap lined up that sinks one is not
/// routed at all.
fn tried<'t>(
    gv: &mut Engine<'_>,
    tree: &'t BlockTree,
    block: BlockId,
    wrapping: Wrapping<'t>,
    candidate: &Candidate,
) -> Result<Option<Wrapped<'t>>, String> {
    let Wrapping {
        laid,
        stacked,
        insets,
    } = wrapping;
    let arranged = match candidate {
        Candidate::Grid => Arrangement {
            grid: true,
            stacked,
            ..Arrangement::default()
        },
        Candidate::Lowered { lowered, columns } => Arrangement {
            lowered: lowered.clone(),
            stacked,
            columns: *columns,
            grid: false,
        },
    };
    let make: Make<'t> =
        Rc::new(move || CardLayout::new(tree, laid, block, insets, arranged.clone()));
    let Candidate::Lowered { lowered, .. } = candidate else {
        return Ok(Some(wrap_of(lay_both(gv, make)?, None)));
    };
    let held = tree.get(block);
    let around = |card: &str| held.cluster_of.get(card).cloned();
    let mut layout = make();
    layout.clusters.keep_ties = true;
    if sinks(lowered, &layout.lined(gv)?.boxes, around) {
        return Ok(None);
    }
    let wrapped = wrap_of(lay_both(gv, make)?, Some(lowered.clone()));
    Ok((!sinks(lowered, &wrapped.laying.tied.boxes, around)).then_some(wrapped))
}

/// The wrap kept, settled: chosen with its titles tied, it is laid again with
/// them pulled down, and kept so unless that sinks a card.
fn settled_wrap(gv: &mut Engine<'_>, held: &Block, best: &Wrapped<'_>) -> Result<Rc<Laid>, String> {
    let kept = settled(gv, &best.laying)?;
    let around = |card: &str| held.cluster_of.get(card).cloned();
    let sunk = sinks(&best.lowered, &kept.boxes, around);
    Ok(if sunk {
        Rc::clone(&best.laying.tied)
    } else {
        kept
    })
}

/// Whether one wrap reads better than another: it scores higher, or, as well,
/// deals its rank into fewer rows.
fn wraps_better(one: &Weighing, other: &Weighing) -> bool {
    let (mine, theirs) = (&one.weighed, &other.weighed);
    let tied = abs(score_of(mine) - score_of(theirs)) <= 1e-9;
    if tied
        && let (Some(rows), Some(theirs)) = (one.rows, other.rows)
        && rows != theirs
    {
        return rows < theirs;
    }
    scores_better(mine, theirs)
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
