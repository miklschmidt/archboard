//! A board laid out as blocks, chosen between solves. Each way to lay it out
//! is one solve: with the joins of some blocks kept apart (`joins.rs`), and,
//! drawn inline, with its groups inline or each packed as a block of its own,
//! its first block that could stack laid each way, and, drawn inline, each
//! wrap of that block tried alone (`stacking.rs`). The solves a choice
//! weighs are asked for side by side and weighed in the order the choice
//! weighs them, so the drawing is the one laying them out one by one gives.
//! Each solve tells, with its drawing, what the choices read of it
//! (ADR 0039, ADR 0059).

use std::rc::Rc;

use archboard_scene::geometry::{Point, Rect};
use indexmap::IndexMap;
use serde::Deserialize;

use super::graph::Graph;
use super::joins::{Apart, Lay, lay_joined};
use super::solving::{Boxed, Calling, Solver, Unsolved, try_both};
use super::stacking::stacked_solved;
use crate::blocks::choosing::{draws_better, has_regions, joining_of, reads_better_packed};
use crate::blocks::place::{
    BLOCKS_APART, BLOCKS_FACING, BLOCKS_NESTING, BLOCKS_PLACED, BLOCKS_READ, BLOCKS_READING,
    BLOCKS_STACKING, BLOCKS_STOOD, BLOCKS_UNTIL_STOOD, BLOCKS_WRAP, BLOCKS_WRAPPED, BLOCKS_WRAPS,
};
use crate::json::J;

/// How a board's containers and group regions are drawn: packed as blocks,
/// inline, or inline with each group packed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Nesting {
    Blocks,
    Inline,
    Groups,
}

impl Nesting {
    /// Its name in a solve's options.
    fn name(self) -> &'static str {
        match self {
            Nesting::Blocks => "blocks",
            Nesting::Inline => "inline",
            Nesting::Groups => "groups",
        }
    }
}

/// One card's place in a solve's drawing.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedCard {
    pub(crate) id: String,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) depth: f64,
}

/// One container's place, and the header width the layout made room for.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedFrame {
    pub(crate) id: String,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) depth: f64,
    #[serde(default)]
    pub(crate) header: Option<usize>,
}

/// One group region's place and its caption's.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedRegion {
    pub(crate) group: String,
    #[serde(default)]
    pub(crate) parent: Option<String>,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) caption: Rect,
    pub(crate) depth: f64,
}

/// One relationship's route and its label's place.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedEdge {
    pub(crate) id: String,
    pub(crate) points: Vec<Point>,
    #[serde(default)]
    pub(crate) label: Option<Rect>,
}

/// A whole drawing's geometry, as a solve answers it.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Placed {
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) cards: Vec<PlacedCard>,
    pub(crate) frames: Vec<PlacedFrame>,
    pub(crate) regions: Vec<PlacedRegion>,
    pub(crate) edges: Vec<PlacedEdge>,
    /// Whether facing every block's walls would change the blocks.
    #[serde(default)]
    pub(crate) faces: Option<bool>,
}

/// A drawing a solve answered, and what the choices read of it where one weighs it.
#[derive(Debug)]
pub(crate) struct Drawing {
    pub(crate) placed: Placed,
    pub(crate) reading: Option<String>,
}

impl Drawing {
    /// Whether facing every block's walls would change it.
    pub(crate) fn faces(&self) -> bool {
        self.placed.faces == Some(true)
    }

    /// What the choices read of it.
    fn reading(&self) -> Result<&str, String> {
        self.reading
            .as_deref()
            .ok_or_else(|| "A drawing a choice weighs was solved without its reading.".to_owned())
    }
}

/// Whether one drawing reads better than another, as their readings weigh.
pub(crate) fn better(one: &Drawing, other: &Drawing) -> Result<bool, String> {
    draws_better(one.reading()?, other.reading()?)
}

/// How one solve lays a board out.
#[derive(Clone, Debug, Default)]
pub(super) struct Way {
    /// The blocks whose joins stay apart.
    pub(super) apart: Apart,
    /// Whether a choice weighs its drawing, so it tells its reading.
    pub(super) read: bool,
    /// Whether every block faces its walls.
    pub(super) facing: bool,
    /// How its first block that could stack is laid, if named.
    pub(super) stacking: Option<bool>,
    /// Whether it answers once that block is laid.
    pub(super) until: bool,
    /// How it wraps that block, as the root option names it, if it names it.
    pub(super) wrap: Option<String>,
}

/// What one solve answers: the drawing, unless it answered once its first
/// block that could stack was laid or the one wrap it tried there sank a
/// card; what that block stood at; the block's wrap search, told by a solve
/// that answered once the block was laid; and what that search weighs the
/// one wrap a solve tried on.
pub(super) struct Answer {
    pub(super) drawing: Option<Drawing>,
    pub(super) stood: Option<String>,
    pub(super) wraps: Option<String>,
    pub(super) wrapped: Option<String>,
}

/// The root options that ask a solve to lay a board out one way.
fn options_of(nesting: Nesting, way: &Way) -> Vec<(&'static str, String)> {
    let apart = J::Arr(way.apart.iter().map(|id| J::str(id)).collect()).text();
    let mut options = vec![
        (BLOCKS_NESTING, nesting.name().to_owned()),
        (BLOCKS_APART, apart),
        (BLOCKS_FACING, way.facing.to_string()),
    ];
    if let Some(stacking) = way.stacking {
        options.push((BLOCKS_STACKING, stacking.to_string()));
    }
    if way.until {
        options.push((BLOCKS_UNTIL_STOOD, "true".to_owned()));
    }
    if let Some(wrap) = &way.wrap {
        options.push((BLOCKS_WRAP, wrap.clone()));
    }
    if way.read {
        options.push((BLOCKS_READ, "true".to_owned()));
    }
    options
}

/// The root of a solve's answer, as far as the choices read it.
#[derive(Deserialize)]
struct Told {
    #[serde(default, rename = "layoutOptions")]
    options: IndexMap<String, String>,
}

/// What a solve answered, read.
pub(super) fn read(told: &str) -> Result<Answer, Unsolved> {
    let Told { mut options } = serde_json::from_str(told)
        .map_err(|error| format!("A solve's answer is unreadable: {error}"))?;
    let stood = options.swap_remove(BLOCKS_STOOD);
    let wraps = options.swap_remove(BLOCKS_WRAPS);
    let wrapped = options.swap_remove(BLOCKS_WRAPPED);
    let drawing = match options.get(BLOCKS_PLACED) {
        None => None,
        Some(placed) => Some(Drawing {
            placed: serde_json::from_str(placed)
                .map_err(|error| format!("A solve's drawing is unreadable: {error}"))?,
            reading: options.swap_remove(BLOCKS_READING),
        }),
    };
    Ok(Answer {
        drawing,
        stood,
        wraps,
        wrapped,
    })
}

/// Ask for a solve that lays a board out one way. It starts at once.
pub(super) fn asked<'s, S: Solver>(
    solver: &'s S,
    graph: &Graph,
    nesting: Nesting,
    way: &Way,
    calling: &Calling,
) -> S::Solve<'s> {
    solver.solve(graph.with_options(&options_of(nesting, way)), calling)
}

/// What a solve that lays a board out one way answers.
pub(super) async fn answered<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    way: &Way,
    calling: &Calling,
) -> Result<Answer, Unsolved> {
    read(&asked(solver, graph, nesting, way, calling).await?)
}

/// The drawing a solve answered.
pub(super) fn drawing_of(answer: Answer) -> Result<Rc<Drawing>, String> {
    answer
        .drawing
        .map(Rc::new)
        .ok_or_else(|| "A solve asked for a drawing answered none.".to_owned())
}

/// A board laid out one way, in one solve.
pub(super) async fn solved<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    way: Way,
    calling: &Calling,
) -> Result<Rc<Drawing>, Unsolved> {
    Ok(drawing_of(
        answered(solver, graph, nesting, &way, calling).await?,
    )?)
}

/// A board laid out with every join of lines to one card kept whole the way
/// that reads better. Only Blocks faces its blocks' walls. Drawn inline, the
/// layout with every join before its labels lays its stacking choice out side
/// by side. Each solve tells its drawing's reading only where a choice may
/// weigh it.
async fn joined_out<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    weighed: bool,
) -> Result<Rc<Drawing>, String> {
    let joining = joining_of(&graph.with_options(&[]), nesting.name())?;
    let read = weighed || !joining.is_empty() || nesting == Nesting::Blocks;
    let way = |apart: Apart, facing| Way {
        apart,
        read,
        facing,
        ..Way::default()
    };
    let lay: Lay<'_> = Box::new(
        move |apart: Apart, calling: Calling| -> Boxed<'_, Result<Rc<Drawing>, Unsolved>> {
            Box::pin(async move {
                let way = way(apart, false);
                if nesting != Nesting::Blocks && way.apart.is_empty() {
                    stacked_solved(solver, graph, nesting, way, &calling).await
                } else {
                    solved(solver, graph, nesting, way, &calling).await
                }
            })
        },
    );
    let face: Option<Lay<'_>> = (nesting == Nesting::Blocks).then(|| -> Lay<'_> {
        Box::new(
            move |apart: Apart, calling: Calling| -> Boxed<'_, Result<Rc<Drawing>, Unsolved>> {
                Box::pin(
                    async move { solved(solver, graph, nesting, way(apart, true), &calling).await },
                )
            },
        )
    });
    lay_joined(&joining, lay, face).await
}

/// Lay a measured hierarchy out as blocks and route every relationship.
/// Drawn inline, a board whose groups gather into regions is also laid with
/// each group's region packed as a block of its own, and the layout that
/// reads better is kept: a group whose members stand far apart in the
/// board's ranks spans them all as a tall sparse band, but packed stands whole.
pub(crate) async fn placed_blocks<S: Solver>(
    solver: &S,
    graph: &Graph,
    inline: bool,
) -> Result<Placed, String> {
    let regions = inline && has_regions(&graph.with_options(&[]))?;
    let nesting = if inline {
        Nesting::Inline
    } else {
        Nesting::Blocks
    };
    if !regions {
        let laid = joined_out(solver, graph, nesting, false).await?;
        return Ok(unshared(laid));
    }
    let (laid, packed) = try_both(
        joined_out(solver, graph, nesting, true),
        joined_out(solver, graph, Nesting::Groups, true),
    )
    .await?;
    let chosen = if reads_better_packed(packed.reading()?, laid.reading()?)? {
        packed
    } else {
        laid
    };
    Ok(unshared(chosen))
}

/// A chosen drawing's geometry.
fn unshared(drawing: Rc<Drawing>) -> Placed {
    Rc::try_unwrap(drawing).map_or_else(|shared| shared.placed.clone(), |drawing| drawing.placed)
}
