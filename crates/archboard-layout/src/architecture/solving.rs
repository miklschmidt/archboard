//! Where the solves of a board run (the [`Solver`] port), and the two ways
//! the choices between solves wait on them: for two at once, and for any of
//! several.
//!
//! A render asks for the solves a choice reads side by side, so a host can
//! lay them out at once on as many engines as it has; the choice weighs them
//! in the order laying them out one by one weighs them, so the drawing never
//! depends on which solve answered first.

use std::cell::{Cell, RefCell};
use std::future::{Future, poll_fn};
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

use crate::Graphviz;
use crate::blocks::place::lay_out_board;

/// Where a board's solves run: one measured graph laid out the way its root
/// options name, answered as [`lay_out_board`] answers it. A host may run
/// several at once.
///
/// A solve is called off two ways. Dropping it calls it off for good. Its
/// [`Calling`] calls it off while the choice still waits on it: a solve that
/// an engine already lays out answers all the same, and a later turn that
/// needs it again shares that answer (TASK-464). A host may refuse a solve
/// called off while it still waits for an engine, as [`Unsolved::CalledOff`];
/// the choice then asks for it afresh where it needs it.
pub trait Solver {
    /// One solve under way.
    type Solve<'s>: Future<Output = Result<String, Unsolved>>
    where
        Self: 's;

    /// Ask for one solve, called off by `calling`. It starts at once, before
    /// anything waits for it.
    fn solve(&self, graph: String, calling: &Calling) -> Self::Solve<'_>;
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

/// What calls off the solves of one layout that a choice no longer reads,
/// while it still waits on them. Every clone calls off the same solves.
#[derive(Clone, Default)]
pub struct Calling(Rc<CallingOff>);

/// Whether the solves were called off, and what each host does when they are.
#[derive(Default)]
struct CallingOff {
    off: Cell<bool>,
    hooks: RefCell<Vec<Box<dyn FnOnce()>>>,
}

impl std::fmt::Debug for Calling {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Calling")
            .field("off", &self.0.off.get())
            .finish_non_exhaustive()
    }
}

impl Calling {
    /// Do `hook` once the solves are called off, at once if they already are.
    pub fn on_call_off(&self, hook: impl FnOnce() + 'static) {
        if self.0.off.get() {
            hook();
        } else {
            self.0.hooks.borrow_mut().push(Box::new(hook));
        }
    }

    /// Call the solves off, once.
    pub(crate) fn call_off(&self) {
        if !self.0.off.replace(true) {
            let hooks = self.0.hooks.take();
            for hook in hooks {
                hook();
            }
        }
    }
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

    fn solve(&self, graph: String, _: &Calling) -> Self::Solve<'_> {
        Laying {
            graph: Some(graph),
            graphviz: &self.graphviz,
        }
    }
}

/// Every answer in request order, or the first failure without waiting for
/// the other answers. Returning or dropping this future drops every solve.
pub(crate) async fn try_all<F, One, Error>(asked: Vec<F>) -> Result<Vec<One>, Error>
where
    F: Future<Output = Result<One, Error>>,
{
    let mut asked: Vec<Pin<Box<F>>> = asked.into_iter().map(Box::pin).collect();
    let mut answers: Vec<Option<One>> = asked.iter().map(|_| None).collect();
    poll_fn(|context| {
        for (one, answer) in asked.iter_mut().zip(&mut answers) {
            if answer.is_none()
                && let Poll::Ready(answered) = one.as_mut().poll(context)
            {
                match answered {
                    Ok(answered) => *answer = Some(answered),
                    Err(error) => return Poll::Ready(Err(error)),
                }
            }
        }
        if answers.iter().any(Option::is_none) {
            return Poll::Pending;
        }
        Poll::Ready(Ok(answers.iter_mut().filter_map(Option::take).collect()))
    })
    .await
}

/// Both answers in request order, or either failure without waiting for the
/// other answer. Returning or dropping this future drops both solves.
pub(crate) async fn try_both<A, B, One, Other, Error>(
    first: A,
    second: B,
) -> Result<(One, Other), Error>
where
    A: Future<Output = Result<One, Error>>,
    B: Future<Output = Result<Other, Error>>,
{
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
            (Some(Err(error)), _) | (_, Some(Err(error))) => Poll::Ready(Err(error)),
            (Some(Ok(one)), Some(Ok(other))) => Poll::Ready(Ok((one, other))),
            (held_one, held_other) => {
                one = held_one;
                other = held_other;
                Poll::Pending
            }
        }
    })
    .await
}
