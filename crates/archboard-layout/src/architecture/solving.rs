//! The Solver port for one measured layout. Dropping its future cancels pending work.

use std::future::{Future, poll_fn};
use std::pin::Pin;
use std::task::{Context, Poll};

use crate::Graphviz;
use crate::blocks::place::{Across, Next, lay_out_picture, with_part};

/// Where the picture's measured graph is laid out. The root options name its nesting.
/// Dropping the returned future cancels work that the host has not completed.
pub trait Solver {
    /// One solve under way.
    type Solve<'s>: Future<Output = Result<String, Unsolved>>
    where
        Self: 's;

    /// Ask for one solve. The host can start it before the caller waits.
    fn solve(&self, graph: String) -> Self::Solve<'_>;
}

/// Lay out a measured hierarchy through a solver that runs solves side by side, to the answer
/// that `lay_out_picture` gives it. A Blocks graph that takes a dense placement is solved in parts
/// (ADR 0078); any other graph is one solve.
///
/// # Errors
///
/// What the solver failed the solve with.
pub async fn lay_out_across<S: Solver>(solver: &S, graph: String) -> Result<String, Unsolved> {
    if let Some(across) = Across::of(&graph)
        && let Some(answer) = in_parts(solver, &graph, across).await
    {
        return Ok(answer);
    }
    solver.solve(graph).await
}

/// The answer of a solve in parts, or nothing where one solve answers: a drawing that takes no
/// dense placement, and a part that failed. Every part still under way is called off then.
async fn in_parts<S: Solver>(solver: &S, graph: &str, mut across: Across) -> Option<String> {
    let mut asked = Vec::new();
    loop {
        match across.next() {
            Next::Answer(answer) => return Some(answer),
            Next::Whole => return None,
            Next::Ask(parts) => asked.extend(parts.into_iter().map(|part| {
                let solve = Box::pin(solver.solve(with_part(graph, &part)));
                (part, solve)
            })),
        }
        let (part, answer) = first(&mut asked).await?;
        across.take(&part, &answer.ok()?).ok()?;
    }
}

/// The first of some solves to answer, taken from them, or nothing when none is asked.
async fn first<F: Future>(asked: &mut Vec<(String, Pin<Box<F>>)>) -> Option<(String, F::Output)> {
    if asked.is_empty() {
        return None;
    }
    poll_fn(|context| {
        let ready = (asked.iter_mut().enumerate()).find_map(|(at, (_, solve))| {
            match solve.as_mut().poll(context) {
                Poll::Ready(answer) => Some((at, answer)),
                Poll::Pending => None,
            }
        });
        match ready {
            Some((at, answer)) => Poll::Ready(Some((asked.remove(at).0, answer))),
            None => Poll::Pending,
        }
    })
    .await
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
        Poll::Ready(lay_out_picture(&graph, &mut graphviz).map_err(Unsolved::Failed))
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
