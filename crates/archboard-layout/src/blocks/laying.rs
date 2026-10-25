//! A block of cards laid out both ways its cluster titles may stand (TASK-349).
//! A nested title pulled up by its parent's title exactly as hard as down onto
//! its one unheld member is a tie Graphviz breaks by standing it on the least
//! crowded rank, far above its members; pulling it down one more stands it on
//! the rank just above them. Graphviz may answer that changed graph with
//! another ranking of the whole block, so the block is laid both ways and the
//! pulled one kept only where it crosses and draws no more line. Remedies to
//! the labels of lines leaving and entering containers change the graph the
//! same way, and are kept on the same terms.

use std::cell::RefCell;
use std::rc::Rc;

use crate::ecma::abs;
use crate::geometry::Point;
use crate::track::score::crossings_of;

use super::card_layout::{CardLayout, Engine};
use super::laid::Laid;

/// A fresh layout of a block.
pub type Make<'t> = Rc<dyn Fn() -> CardLayout<'t> + 't>;

/// A layout of a block, and the block laid out by it.
type Layout<'t> = (CardLayout<'t>, Rc<Laid>);

/// A block of cards laid out with every cluster title as Graphviz breaks its
/// ties, and, where some title was pulled up as hard as down, the way to lay
/// it with that title pulled onto its members.
pub struct Laying<'t> {
    /// The block with its titles left tied.
    pub tied: Rc<Laid>,
    remake: Make<'t>,
    /// Whether some title was pulled up as hard as down.
    ties: bool,
    untied: RefCell<Option<Rc<Laid>>>,
}

impl Laying<'_> {
    /// The block with its tied titles pulled onto their members, laid when
    /// first asked for; nothing when no title was tied.
    ///
    /// # Errors
    ///
    /// What Graphviz refused the block's graph with.
    pub fn untied(&self, gv: &mut Engine<'_>) -> Result<Option<Rc<Laid>>, String> {
        if self.ties && self.untied.borrow().is_none() {
            let laid = (self.remake)().lay(gv)?;
            *self.untied.borrow_mut() = Some(laid);
        }
        Ok(self.untied.borrow().clone())
    }
}

/// A change to how a block is ranked that mends something its layout shows,
/// kept only where the changed layout reads no worse.
struct Remedy {
    /// Make the change on a fresh layout, before it is built.
    apply: fn(&mut CardLayout<'_>),
    /// Whether a laid-out block shows what the change mends.
    needed: fn(&Layout<'_>) -> bool,
    /// Whether the changed layout is kept over the one before.
    kept: fn(&Layout<'_>, &Layout<'_>) -> bool,
}

/// How many lines' labels a layout stands beside a container the line leaves.
fn beside(layout: &Layout<'_>) -> usize {
    let (making, laid) = layout;
    making.clusters.labels_beside(&making.links(), laid)
}

/// How much page a laid-out block takes.
fn area(laid: &Laid) -> f64 {
    laid.width * laid.height
}

/// Whether a layout with its entering labels anchored reads no worse than the
/// one before, on no more page.
fn no_larger(after: &Layout<'_>, before: &Layout<'_>) -> bool {
    reads_no_worse(&after.1, &before.1) && area(&after.1) <= area(&before.1)
}

/// The remedies a block's layout is tried with, in turn: the label of a line
/// leaving a container pulled onto the line's lower end where one stood
/// beside the container, and the label of a line entering one held below a
/// line from inside it.
const REMEDIES: [Remedy; 2] = [
    Remedy {
        apply: |layout| layout.clusters.pulls_leaving = true,
        needed: |layout| beside(layout) > 0,
        kept: |after, before| beside(after) < beside(before) && no_larger(after, before),
    },
    Remedy {
        apply: |layout| layout.clusters.anchors_labels = true,
        needed: |layout| layout.0.clusters.anchorable(&layout.0.links()),
        kept: no_larger,
    },
];

/// A block of cards laid out with its titles left tied, and the way to lay it
/// with them pulled onto their members; both with every remedy its layout keeps.
///
/// # Errors
///
/// What Graphviz refused the block's graph with.
pub fn lay_both<'t>(gv: &mut Engine<'_>, make: Make<'t>) -> Result<Laying<'t>, String> {
    let mut laid = tied_layout(gv, &make)?;
    let mut making = make;
    for remedy in &REMEDIES {
        if !(remedy.needed)(&laid) {
            continue;
        }
        let (base, apply) = (Rc::clone(&making), remedy.apply);
        let remade: Make<'t> = Rc::new(move || {
            let mut layout = base();
            apply(&mut layout);
            layout
        });
        let again = tied_layout(gv, &remade)?;
        if (remedy.kept)(&again, &laid) {
            (making, laid) = (remade, again);
        }
    }
    let (tying, tied) = laid;
    Ok(Laying {
        tied,
        remake: making,
        ties: tying.clusters.tied,
        untied: RefCell::new(None),
    })
}

/// A block laid out with its titles left tied.
fn tied_layout<'t>(gv: &mut Engine<'_>, make: &Make<'t>) -> Result<Layout<'t>, String> {
    let mut tying = make();
    tying.clusters.keep_ties = true;
    let laid = tying.lay(gv)?;
    Ok((tying, laid))
}

/// How much more line a block with its titles pulled onto their members may
/// draw and still be kept.
const LONGER_SHARE: f64 = 0.05;

/// Whether one layout of a block crosses no more than another and draws no
/// clearly more line.
fn reads_no_worse(one: &Laid, other: &Laid) -> bool {
    let crosses = crossings_of(one.lines.values().map(Vec::as_slice))
        > crossings_of(other.lines.values().map(Vec::as_slice));
    let longer = line_length(one.lines.values().map(Vec::as_slice))
        > line_length(other.lines.values().map(Vec::as_slice)) * (1.0 + LONGER_SHARE);
    !crosses && !longer
}

/// A block with its tied titles pulled onto their members, unless that
/// crosses more or draws clearly more line.
///
/// # Errors
///
/// What Graphviz refused the block's graph with.
pub fn settled(gv: &mut Engine<'_>, laying: &Laying<'_>) -> Result<Rc<Laid>, String> {
    let Some(untied) = laying.untied(gv)? else {
        return Ok(Rc::clone(&laying.tied));
    };
    Ok(if reads_no_worse(&untied, &laying.tied) {
        untied
    } else {
        Rc::clone(&laying.tied)
    })
}

/// How much line some lines draw.
pub fn line_length<'a>(lines: impl IntoIterator<Item = &'a [Point]>) -> f64 {
    let mut sum = 0.0;
    for points in lines {
        for pair in points.windows(2) {
            sum += abs(pair[1].x - pair[0].x) + abs(pair[1].y - pair[0].y);
        }
    }
    sum
}
