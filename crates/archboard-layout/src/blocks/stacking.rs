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
use super::wraps::weighed;

/// How near two scores or fits of a block are for the stacking choice's earlier weighing to call them tied.
const NEAR: f64 = 0.05;

/// A score at the block's best, and how well its page fits the pane.
#[derive(Clone, Copy, Debug)]
pub struct Scored {
    pub score: f64,
    pub fit: f64,
}

/// What the stacking choice weighs of a block laid out one way: its titles
/// tied, and pulled down where that is kept.
#[derive(Clone, Debug)]
pub struct Stood {
    pub tied: Scored,
    pub settled: Scored,
    pub length: f64,
    pub weighed: Weighed,
}

impl Stood {
    /// What it stood at, as the solve tells it.
    pub fn json(&self) -> J {
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

/// The stacking choice of one solve: the way its first block that could
/// stack is laid, when only one way is, whether the solve answers once it is,
/// and what that way stood at once laid.
#[derive(Clone, Debug, Default)]
pub struct Stacking {
    pub way: Option<bool>,
    pub until: bool,
    pub stood: Option<Stood>,
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
pub fn stacks(stacked: &Stood, plain: &Stood) -> bool {
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

/// A block of cards laid out whole: with the containers a line from another
/// container enters stacked below it, or else as Graphviz ranks them. The
/// first block of a solve that could stack is laid only the way the solve's
/// stacking names, when it names one, and what that way stood at is kept; a
/// solve that answers once it is laid ends there. Answers the block laid out,
/// and whether it stacks.
pub fn stacked_or_not(
    gv: &mut Engine<'_>,
    tree: &BlockTree,
    block: BlockId,
    laid: &LaidMap,
    insets: Insets,
    stacking: &mut Stacking,
) -> Result<(Rc<Laid>, bool), Stop> {
    let make = |stacked: bool| -> Make<'_> {
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
    };
    if !CardLayout::new(tree, laid, block, insets, Arrangement::default()).stacks() {
        let laying = lay_both(gv, make(false))?;
        return Ok((settled(gv, &laying)?, false));
    }
    if let Some(way) = stacking.way {
        let laying = lay_both(gv, make(way))?;
        stacking.way = None;
        let stood = stood_of(gv, tree, block, insets, &laying)?;
        stacking.stood = Some(stood.clone());
        if stacking.until {
            return Err(Stop::Stood(Box::new(stood)));
        }
        return Ok((settled(gv, &laying)?, way));
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
