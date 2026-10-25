//! Where the solves of a board run (the [`Solver`] port), and the two ways
//! the choices between solves wait on them: for two at once, and for any of
//! several.
//!
//! A render asks for the solves a choice reads side by side, so a host can
//! lay them out at once on as many engines as it has; the choice weighs them
//! in the order laying them out one by one weighs them, so the drawing never
//! depends on which solve answered first.

use std::future::{Future, poll_fn};
use std::pin::Pin;
use std::task::{Context, Poll};

use crate::Graphviz;
use crate::blocks::place::lay_out_board;

/// Where a board's solves run: one measured graph laid out the way its root
/// options name, answered as [`lay_out_board`] answers it. A host may run
/// several at once. Dropping a solve under way calls it off: one still
/// waiting for an engine is never laid out.
pub trait Solver {
    /// One solve under way.
    type Solve<'s>: Future<Output = Result<String, String>>
    where
        Self: 's;

    /// Ask for one solve. It starts at once, before anything waits for it.
    fn solve(&self, graph: String) -> Self::Solve<'_>;
}

/// A future of the choice, boxed so the choices can hold several kinds.
pub(crate) type Boxed<'a, T> = Pin<Box<dyn Future<Output = T> + 'a>>;

/// Every solve laid out here, in this process, when it is first waited for,
/// with the Graphviz `graphviz` gives it for its graph: Graphviz as freshly
/// loaded, so that no solve's answer depends on another's.
#[derive(Debug)]
pub struct InProcess<F> {
    graphviz: F,
}

impl<F> InProcess<F> {
    /// Solve here, with the Graphviz each graph is given.
    pub fn new(graphviz: F) -> Self {
        InProcess { graphviz }
    }
}

/// One solve laid out here once it is first waited for.
#[derive(Debug)]
pub struct Laying<'a, F> {
    graph: Option<String>,
    graphviz: &'a F,
}

impl<F, G> Future for Laying<'_, F>
where
    F: Fn(&str) -> G,
    G: Graphviz,
{
    type Output = Result<String, String>;

    fn poll(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
        let graph = self
            .graph
            .take()
            .expect("a solve laid out once is not waited for again");
        let mut graphviz = (self.graphviz)(&graph);
        Poll::Ready(lay_out_board(&graph, &mut graphviz))
    }
}

impl<F, G> Solver for InProcess<F>
where
    F: Fn(&str) -> G,
    G: Graphviz,
{
    type Solve<'s>
        = Laying<'s, F>
    where
        Self: 's;

    fn solve(&self, graph: String) -> Self::Solve<'_> {
        Laying {
            graph: Some(graph),
            graphviz: &self.graphviz,
        }
    }
}

/// Both futures' answers, the first started first.
pub(crate) async fn both<A: Future, B: Future>(first: A, second: B) -> (A::Output, B::Output) {
    let mut first = Box::pin(first);
    let mut second = Box::pin(second);
    let mut one = None;
    let mut other = None;
    poll_fn(|context| {
        if one.is_none()
            && let Poll::Ready(answer) = first.as_mut().poll(context)
        {
            one = Some(answer);
        }
        if other.is_none()
            && let Poll::Ready(answer) = second.as_mut().poll(context)
        {
            other = Some(answer);
        }
        match (one.take(), other.take()) {
            (Some(one), Some(other)) => Poll::Ready((one, other)),
            (held_one, held_other) => {
                one = held_one;
                other = held_other;
                Poll::Pending
            }
        }
    })
    .await
}
