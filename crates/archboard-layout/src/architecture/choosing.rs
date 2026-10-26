//! A board laid out as blocks, chosen between solves. Each way to lay it out
//! is one solve: with the joins of some blocks kept apart (`joins.rs`), and,
//! drawn inline, with its groups inline or each packed as a block of its own,
//! and its first block that could stack laid each way. The solves a choice
//! weighs are asked for side by side and weighed in the order the choice
//! weighs them, so the drawing is the one laying them out one by one gives.
//! Each solve tells, with its drawing, what the choices read of it
//! (ADR 0039, ADR 0059).

use std::future::{Future, poll_fn};
use std::pin::{Pin, pin};
use std::rc::Rc;
use std::task::Poll;

use archboard_scene::geometry::{Point, Rect};
use indexmap::IndexMap;
use serde::Deserialize;

use super::graph::Graph;
use super::joins::{Apart, Lay, lay_joined};
use super::solving::{Boxed, Calling, Solver, Unsolved, try_both};
use crate::blocks::choosing::{
    could_stack, draws_better, has_regions, joining_of, reads_better_packed, stacks_of,
};
use crate::blocks::place::{
    BLOCKS_APART, BLOCKS_FACING, BLOCKS_NESTING, BLOCKS_PLACED, BLOCKS_READ, BLOCKS_READING,
    BLOCKS_STACKING, BLOCKS_STOOD, BLOCKS_UNTIL_STOOD,
};
use crate::json::J;

/// How a board's containers and group regions are drawn: packed as blocks,
/// inline, or inline with each group packed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Nesting {
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
struct Way {
    /// The blocks whose joins stay apart.
    apart: Apart,
    /// Whether a choice weighs its drawing, so it tells its reading.
    read: bool,
    /// Whether every block faces its walls.
    facing: bool,
    /// How its first block that could stack is laid, if named.
    stacking: Option<bool>,
    /// Whether it answers once that block is laid.
    until: bool,
}

/// What one solve answers: the drawing, unless it answered once its first
/// block that could stack was laid, and what that block stood at.
struct Answer {
    drawing: Option<Drawing>,
    stood: Option<String>,
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
fn read(told: &str) -> Result<Answer, Unsolved> {
    let Told { mut options } = serde_json::from_str(told)
        .map_err(|error| format!("A solve's answer is unreadable: {error}"))?;
    let stood = options.swap_remove(BLOCKS_STOOD);
    let Some(placed) = options.get(BLOCKS_PLACED) else {
        return Ok(Answer {
            drawing: None,
            stood,
        });
    };
    let placed: Placed = serde_json::from_str(placed)
        .map_err(|error| format!("A solve's drawing is unreadable: {error}"))?;
    let reading = options.swap_remove(BLOCKS_READING);
    Ok(Answer {
        drawing: Some(Drawing { placed, reading }),
        stood,
    })
}

/// Ask for a solve that lays a board out one way. It starts at once.
fn asked<'s, S: Solver>(
    solver: &'s S,
    graph: &Graph,
    nesting: Nesting,
    way: &Way,
    calling: &Calling,
) -> S::Solve<'s> {
    solver.solve(graph.with_options(&options_of(nesting, way)), calling)
}

/// What a solve that lays a board out one way answers.
async fn answered<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    way: &Way,
    calling: &Calling,
) -> Result<Answer, Unsolved> {
    read(&asked(solver, graph, nesting, way, calling).await?)
}

/// The drawing a solve answered.
fn drawing_of(answer: Answer) -> Result<Rc<Drawing>, String> {
    answer
        .drawing
        .map(Rc::new)
        .ok_or_else(|| "A solve asked for a drawing answered none.".to_owned())
}

/// A board laid out one way, in one solve.
async fn solved<S: Solver>(
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

/// Whether the first block that can stack is stacked, as the partial solves
/// laid each way tell; nothing when no block could stack.
fn stacking_of(stacked: &Answer, plain: &Answer) -> Result<Option<bool>, String> {
    match (&stacked.stood, &plain.stood) {
        (Some(high), Some(low)) => stacks_of(high, low).map(Some),
        _ => Ok(None),
    }
}

/// Two callings of their own, each called off with `calling` as well.
fn callings_under(calling: &Calling) -> [Calling; 2] {
    let callings = [Calling::default(), Calling::default()];
    let off = callings.clone();
    calling.on_call_off(move || {
        for one in &off {
            one.call_off();
        }
    });
    callings
}

/// A way to lay a board out, its first block that could stack laid one way,
/// and the solve laying it answering once that block is laid where `until`.
fn stacked_way(way: &Way, stacking: bool, until: bool) -> Way {
    Way {
        stacking: Some(stacking),
        until,
        ..way.clone()
    }
}

/// Choose whether the first block that can stack is stacked, and lay the
/// whole board only that way. The two partial solves stop once they can
/// answer the choice (TASK-512). Where they do not answer at once, the whole
/// board laid each way is asked for too, a turn after every other solve the
/// render is sure to need, so the render waits for the longer of the partial
/// solves and the whole one chosen, not for one after the other. The whole
/// one not chosen is called off, and a host that has not started it never
/// lays it out. A board with no block that can stack is drawn by the partial
/// solve that does not stack. Drawn inline, a board whose graph shows that no
/// block could stack is drawn by that solve alone, which lays the whole board.
async fn stacked_solved<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    way: Way,
    calling: &Calling,
) -> Result<Rc<Drawing>, Unsolved> {
    if nesting == Nesting::Inline && !could_stack(&graph.with_options(&[]))? {
        return solved(
            solver,
            graph,
            nesting,
            stacked_way(&way, false, true),
            calling,
        )
        .await;
    }
    let (high, low) = (
        stacked_way(&way, true, true),
        stacked_way(&way, false, true),
    );
    let partial = try_both(
        answered(solver, graph, nesting, &high, calling),
        answered(solver, graph, nesting, &low, calling),
    );
    let mut partial = pin!(partial);
    let laying = Laying {
        solver,
        graph,
        nesting,
        way: &way,
        calling,
    };
    match first_answers(partial.as_mut()).await {
        Poll::Ready(answers) => laying.chosen(answers?).await,
        Poll::Pending => laying.speculated(partial).await,
    }
}

/// The partial solves' answers if they come at once: polling them asks for
/// them, and they are polled again once every other solve the render is
/// sure to need has been asked for.
async fn first_answers<F: Future>(mut partial: Pin<&mut F>) -> Poll<F::Output> {
    let early = polled(partial.as_mut()).await;
    if early.is_ready() {
        return early;
    }
    once_more().await;
    polled(partial).await
}

/// One stacking choice: where its solves run, the board and how it is laid.
struct Laying<'a, S> {
    solver: &'a S,
    graph: &'a Graph,
    nesting: Nesting,
    way: &'a Way,
    calling: &'a Calling,
}

impl<S: Solver> Laying<'_, S> {
    /// The board laid the way the partial solves' answers choose.
    async fn chosen(&self, (stacked, plain): (Answer, Answer)) -> Result<Rc<Drawing>, Unsolved> {
        let Some(stacking) = stacking_of(&stacked, &plain)? else {
            return Ok(drawing_of(plain)?);
        };
        let way = stacked_way(self.way, stacking, false);
        solved(self.solver, self.graph, self.nesting, way, self.calling).await
    }

    /// The board laid both ways whole beside the partial solves, the way
    /// they choose kept and the other called off.
    async fn speculated<F>(&self, partial: Pin<&mut F>) -> Result<Rc<Drawing>, Unsolved>
    where
        F: Future<Output = Result<(Answer, Answer), Unsolved>>,
    {
        let callings = callings_under(self.calling);
        let ask = |stacking: bool, calling: &Calling| {
            let way = stacked_way(self.way, stacking, false);
            asked(self.solver, self.graph, self.nesting, &way, calling)
        };
        let mut wholes = [
            Some(ask(true, &callings[0])),
            Some(ask(false, &callings[1])),
        ];
        let (stacked, plain) = partial.await?;
        let chosen = stacking_of(&stacked, &plain)?.map(|stacking| usize::from(!stacking));
        for (at, one) in callings.iter().enumerate() {
            if Some(at) != chosen {
                one.call_off();
                wholes[at] = None;
            }
        }
        let Some(whole) = chosen.and_then(|at| wholes[at].take()) else {
            return Ok(drawing_of(plain)?);
        };
        Ok(drawing_of(read(&whole.await?)?)?)
    }
}

/// A future polled once: what it answered, or that it waits.
async fn polled<F: Future>(mut future: Pin<&mut F>) -> Poll<F::Output> {
    poll_fn(|context| Poll::Ready(future.as_mut().poll(context))).await
}

/// Wait once, so that whatever else the render polls now asks for its solves first.
async fn once_more() {
    let mut waited = false;
    poll_fn(|context| {
        if waited {
            Poll::Ready(())
        } else {
            waited = true;
            context.waker().wake_by_ref();
            Poll::Pending
        }
    })
    .await;
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
