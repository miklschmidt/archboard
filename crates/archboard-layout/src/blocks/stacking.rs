//! Whether a block of cards stacks its containers, and that choice laid out
//! side by side. The renderer may ask for two solves, each laying the first
//! block that could stack only one way and telling what that way stood at
//! (`Stood`); it then makes the choice where it runs, by the same weighing,
//! and keeps the solve that laid the way chosen (TASK-377).

use std::rc::Rc;

use crate::constants::fit_in;
use crate::ecma::{abs, js_max, js_min};
use crate::json::J;
use crate::track::score::{Weighed, score_of, takes};

use super::card_layout::{Arrangement, CardLayout, Engine};
use super::fold::fold_plan;
use super::laid::{Insets, Laid, LaidMap};
use super::laying::{Laying, Make, lay_both, line_length, settled};
use super::place::Stop;
use super::tree::{BlockId, BlockTree};
use super::weighing::weighed_laid;
use super::wraps::{Search, Tried, Unwrapped, Weighing, Wrapping, search_of, weighed};

/// How near two scores or fits of a block are for the stacking choice's earlier weighing to call them tied.
const NEAR: f64 = 0.05;

/// A score at the block's best, and how well its page fits the pane.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Scored {
    pub score: f64,
    pub fit: f64,
}

/// What the stacking choice weighs of a block laid out one way: its titles
/// tied, and pulled down where that is kept.
#[derive(Clone, Debug)]
pub(crate) struct Stood {
    pub tied: Scored,
    pub settled: Scored,
    pub length: f64,
    pub weighed: Weighed,
}

impl Stood {
    /// What it stood at, as the solve tells it.
    pub(crate) fn json(&self) -> J {
        let scored = |one: &Scored| {
            vec![
                ("score".to_owned(), J::Num(one.score)),
                ("fit".to_owned(), J::Num(one.fit)),
            ]
        };
        let mut settled = scored(&self.settled);
        settled.push(("length".to_owned(), J::Num(self.length)));
        let weighed = &self.weighed;
        let mut measures = vec![
            ("width".to_owned(), J::Num(weighed.width)),
            ("height".to_owned(), J::Num(weighed.height)),
            ("crossings".to_owned(), J::Num(weighed.crossings)),
        ];
        for (name, value) in [("bends", weighed.bends), ("length", weighed.length)] {
            if let Some(value) = value {
                measures.push((name.to_owned(), J::Num(value)));
            }
        }
        settled.push(("weighed".to_owned(), J::Obj(measures)));
        J::Obj(vec![
            ("tied".to_owned(), J::Obj(scored(&self.tied))),
            ("settled".to_owned(), J::Obj(settled)),
        ])
    }
}

/// How a solve that names the way its first block that could stack is laid
/// wraps that block.
#[derive(Clone, Debug, Default)]
pub(crate) enum Wrap {
    /// As its wrap search chooses.
    #[default]
    Searched,
    /// Not at all: solves of their own try its candidates.
    Unwrapped,
    /// With this candidate alone, the block not laid whole first.
    Only(Tried),
}

/// The stacking choice of one solve: the way its first block that could
/// stack is laid, when only one way is, whether the solve answers once it is,
/// how it wraps that block, and what that way stood at once laid. A solve
/// that answers once the block is laid tells that block's wrap search too;
/// one that tries a single candidate tells what the search weighs it on.
#[derive(Clone, Debug, Default)]
pub(crate) struct Stacking {
    pub way: Option<bool>,
    pub until: bool,
    pub wrap: Wrap,
    pub stood: Option<Stood>,
    pub search: Option<Search>,
    pub weighing: Option<Weighing>,
}

/// The way a solve names for its first block that could stack, and how it wraps it.
pub(crate) struct Named {
    pub way: bool,
    pub wrap: Wrap,
}

impl Stacking {
    /// The way the solve names for a block of cards, and how it wraps it,
    /// when the block could stack and is the first that could: taken, so a
    /// later block, or this block laid again, is laid both ways.
    pub(crate) fn named(&mut self, could_stack: bool) -> Option<Named> {
        if !could_stack {
            return None;
        }
        Some(Named {
            way: self.way.take()?,
            wrap: std::mem::take(&mut self.wrap),
        })
    }
}

/// Whether two measures of a block stand within a near tie of each other.
fn near(one: f64, other: f64) -> bool {
    abs(one - other) <= NEAR * js_min(one, other)
}

/// How a block laid out whole scores at its best, as it stands or folded, and
/// how well its page fits the pane.
fn scored_of(tree: &BlockTree, block: BlockId, insets: Insets, laid: &Laid) -> Scored {
    let plan = fold_plan(tree.get(block), laid, insets, &weighed(laid));
    let score = js_max(
        score_of(&weighed(laid)),
        plan.map_or(0.0, |plan| score_of(&plan.weighed)),
    );
    Scored {
        score,
        fit: fit_in(laid.width, laid.height),
    }
}

/// What the stacking choice weighs of a block laid out one way.
fn stood_of(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    insets: Insets,
    laying: &Laying<'_>,
) -> Result<Stood, String> {
    let kept = settled(gv, laying)?;
    Ok(Stood {
        tied: scored_of(tree, block, insets, &laying.tied),
        settled: scored_of(tree, block, insets, &kept),
        length: line_length(kept.lines.values().map(Vec::as_slice)),
        weighed: weighed_laid(&kept),
    })
}

/// Whether a block stacks on its score, as before ADR 0039.
fn scores_stacked(stacked: &Scored, plain: &Scored) -> bool {
    if near(stacked.score, plain.score) && !near(stacked.fit, plain.fit) {
        stacked.fit > plain.fit
    } else {
        stacked.score > plain.score
    }
}

/// Whether a block stacks: where it scores better as before ADR 0039, with
/// its titles tied and pulled down, pulling them down changing the choice only
/// where that draws no more line, and its lines as drawn read better; or where
/// either way it is chosen reads no worse on any measure than the other.
pub(crate) fn stacks(stacked: &Stood, plain: &Stood) -> bool {
    let tied = scores_stacked(&stacked.tied, &plain.tied);
    let pulled = scores_stacked(&stacked.settled, &plain.settled);
    let length = |one: bool| if one { stacked.length } else { plain.length };
    let (was, is) = (length(tied), length(pulled));
    let earlier = if tied != pulled && is > was {
        tied
    } else {
        pulled
    };
    takes(&stacked.weighed, &plain.weighed, earlier, None)
}

/// A fresh layout of a block of cards, stacked or not.
fn made<'t>(
    tree: &'t BlockTree,
    laid: &'t LaidMap,
    block: BlockId,
    insets: Insets,
    stacked: bool,
) -> Make<'t> {
    Rc::new(move || {
        CardLayout::new(
            tree,
            laid,
            block,
            insets,
            Arrangement {
                stacked,
                ..Arrangement::default()
            },
        )
    })
}

/// The first block of a solve that could stack, laid out whole only the way
/// the solve names, and what that way stood at kept. A solve that answers
/// once the block is laid ends here, and tells the block's wrap search too.
pub(crate) fn named_whole(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    laid: &LaidMap,
    insets: Insets,
    way: bool,
    stacking: &mut Stacking,
) -> Result<Rc<Laid>, Stop> {
    let laying = lay_both(gv, made(tree, laid, block, insets, way))?;
    let stood = stood_of(gv, tree, block, insets, &laying)?;
    let whole = settled(gv, &laying)?;
    stacking.stood = Some(stood.clone());
    if stacking.until {
        let wrapping = Wrapping {
            laid,
            stacked: way,
            insets,
        };
        stacking.search = search_of(
            tree,
            block,
            &Unwrapped {
                wrapping,
                whole: &whole,
            },
        );
        return Err(Stop::Stood(Box::new(stood)));
    }
    Ok(whole)
}

/// A block of cards laid out whole: with the containers a line from another
/// container enters stacked below it, or else as Graphviz ranks them, where
/// it `could_stack`. Answers the block laid out, and whether it stacks.
pub(crate) fn stacked_or_not(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    laid: &LaidMap,
    insets: Insets,
    could_stack: bool,
) -> Result<(Rc<Laid>, bool), String> {
    let make = |stacked: bool| made(tree, laid, block, insets, stacked);
    if !could_stack {
        let laying = lay_both(gv, make(false))?;
        return Ok((settled(gv, &laying)?, false));
    }
    let plain = lay_both(gv, make(false))?;
    let stacked = lay_both(gv, make(true))?;
    let chosen = {
        let one = stood_of(gv, tree, block, insets, &stacked)?;
        let other = stood_of(gv, tree, block, insets, &plain)?;
        stacks(&one, &other)
    };
    Ok((settled(gv, if chosen { &stacked } else { &plain })?, chosen))
}
