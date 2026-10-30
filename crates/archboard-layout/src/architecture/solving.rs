//! The Solver port for one measured layout. Dropping its future cancels pending work.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use crate::Graphviz;
use crate::blocks::place::lay_out_board;

/// Where the board's measured graph is laid out. The root options name its nesting.
/// Dropping the returned future cancels work that the host has not completed.
pub trait Solver {
    /// One solve under way.
    type Solve<'s>: Future<Output = Result<String, Unsolved>>
    where
        Self: 's;

    /// Ask for one solve. The host can start it before the caller waits.
    fn solve(&self, graph: String) -> Self::Solve<'_>;
}

/// Why a solve answered no drawing.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Unsolved {
    /// Its host refused it, because it was called off before an engine took it.
    CalledOff,
    /// Its host failed it, in these words.
    Failed(String),
}

impl From<String> for Unsolved {
    fn from(words: String) -> Self {
        Unsolved::Failed(words)
    }
}

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

/// One solve laid out here once it is first waited for, called off or not.
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
    type Output = Result<String, Unsolved>;

    fn poll(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
        let graph = self
            .graph
            .take()
            .expect("a solve laid out once is not waited for again");
        let mut graphviz = (self.graphviz)(&graph);
        Poll::Ready(lay_out_board(&graph, &mut graphviz).map_err(Unsolved::Failed))
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
