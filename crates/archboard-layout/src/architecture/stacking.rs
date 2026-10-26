//! The stacking choice laid out side by side. The first block of a board
//! that could stack is laid each way by a partial solve that stops once it is
//! laid, and the whole board is laid only the way that reads better
//! (TASK-512). Drawn inline, that block's wrap search is split between solves
//! too: each whole solve lays the block with no wrap, and one solve tries each
//! candidate the partial solve told, so the render waits for the slowest
//! candidate, not for every candidate in a row (TASK-548.06).

use std::future::{Future, poll_fn};
use std::pin::{Pin, pin};
use std::rc::Rc;
use std::task::{Context, Poll};

use super::choosing::{Answer, Drawing, Nesting, Way, answered, asked, drawing_of, read, solved};
use super::graph::Graph;
use super::solving::{Calling, Solver, Unsolved, try_all};
use crate::blocks::choosing::{could_stack, stacks_of, wrap_kept, wraps_asked};
use crate::blocks::wraps::Search;

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

/// A way to lay the whole board out, its first block that could stack laid
/// one way and wrapped as `wrap` names: `null` for no wrap, or one candidate
/// of that block's wrap search alone.
fn wrapped_way(way: &Way, stacking: bool, wrap: String) -> Way {
    Way {
        wrap: Some(wrap),
        ..stacked_way(way, stacking, false)
    }
}

/// Choose whether the first block that can stack is stacked, and lay the
/// whole board only that way. The two partial solves stop once they can
/// answer the choice (TASK-512). Where they do not answer at once, the whole
/// board laid each way is asked for too, a turn after every other solve the
/// render is sure to need, so the render waits for the longer of the partial
/// solves and the whole one chosen, not for one after the other. The whole
/// one not chosen is called off, and a host that has not started it never
/// lays it out. Drawn inline, each whole solve lays that block with no wrap:
/// the partial solve laying the block one way tells the block's wrap search,
/// and solves of their own try its candidates (`kept_drawing`), asked as
/// soon as that partial solve answers. A board with no block that can stack is drawn by
/// the partial solve that does not stack. Drawn inline, a board whose graph
/// shows that no block could stack is drawn by that solve alone, which lays
/// the whole board.
pub(super) async fn stacked_solved<S: Solver>(
    solver: &S,
    graph: &Graph,
    nesting: Nesting,
    way: Way,
    calling: &Calling,
) -> Result<Rc<Drawing>, Unsolved> {
    if !could_stack(&graph.with_options(&[]), nesting.name())? {
        return solved(
            solver,
            graph,
            nesting,
            stacked_way(&way, false, true),
            calling,
        )
        .await;
    }
    let ways = [
        stacked_way(&way, true, true),
        stacked_way(&way, false, true),
    ];
    let mut partials = Partials {
        asked: ways
            .each_ref()
            .map(|one| Some(Box::pin(answered(solver, graph, nesting, one, calling)))),
        told: [None, None],
    };
    let laying = Laying {
        solver,
        graph,
        nesting,
        way: &way,
        calling,
    };
    match partials.first_answers().await? {
        Some(answers) => laying.chosen(answers).await,
        None => laying.speculated(partials).await,
    }
}

/// The two partial solves of the stacking choice, laid stacked and laid
/// plain: each one under way, and what each answered.
struct Partials<F> {
    asked: [Option<Pin<Box<F>>>; 2],
    told: [Option<Answer>; 2],
}

impl<F: Future<Output = Result<Answer, Unsolved>>> Partials<F> {
    /// Move each partial solve under way on: which of them answered now, or
    /// the first failure.
    fn progressed(&mut self, context: &mut Context<'_>) -> Result<Vec<usize>, Unsolved> {
        let mut answered = Vec::new();
        for (at, (asked, told)) in self.asked.iter_mut().zip(&mut self.told).enumerate() {
            if let Some(one) = asked
                && let Poll::Ready(answer) = one.as_mut().poll(context)
            {
                *asked = None;
                *told = Some(answer?);
                answered.push(at);
            }
        }
        Ok(answered)
    }

    /// Both answers if they come at once: polling the partial solves asks for
    /// them, and they are polled again once every other solve the render is
    /// sure to need has been asked for.
    async fn first_answers(&mut self) -> Result<Option<(Answer, Answer)>, Unsolved> {
        poll_fn(|context| Poll::Ready(self.progressed(context))).await?;
        if self.told.iter().any(Option::is_none) {
            once_more().await;
            poll_fn(|context| Poll::Ready(self.progressed(context))).await?;
        }
        Ok(self.answers())
    }

    /// Both answers, laid stacked and plain, once both came.
    fn answers(&mut self) -> Option<(Answer, Answer)> {
        if self.told.iter().any(Option::is_none) {
            return None;
        }
        let [Some(stacked), Some(plain)] = std::mem::take(&mut self.told) else {
            return None;
        };
        Some((stacked, plain))
    }
}

/// The solves that lay the whole board one way: with no wrap at its first
/// block that could stack and, once the partial solve laying that way told
/// the block's wrap search, each of its candidates alone; or one solve that
/// wraps that block as its search chooses, where the search is not split.
struct Whole<W> {
    unwrapped: W,
    tries: Tries<W>,
}

/// A block's wrap search and one solve for each of its candidates, if it has a search.
type Tries<W> = Option<(Search, Vec<W>)>;

/// One stacking choice: where its solves run, the board and how it is laid.
struct Laying<'a, S> {
    solver: &'a S,
    graph: &'a Graph,
    nesting: Nesting,
    way: &'a Way,
    calling: &'a Calling,
}

impl<S: Solver> Laying<'_, S> {
    /// Whether the wrap search of the first block that could stack is split
    /// between solves. Only drawn inline: there that block is the whole
    /// board, and its search was most of the slowest solve of the widest
    /// boards. With its groups packed, each group is a block of its own and
    /// the search costs little, so solves of their own would only take
    /// workers from solves the render waits for.
    fn splits(&self) -> bool {
        self.nesting == Nesting::Inline
    }

    /// The whole board laid one way: with no wrap at its first block that
    /// could stack where the search is split, else as its search chooses.
    fn unwrapped(&self, stacking: bool, calling: &Calling) -> S::Solve<'_> {
        let way = if self.splits() {
            wrapped_way(self.way, stacking, "null".to_owned())
        } else {
            stacked_way(self.way, stacking, false)
        };
        asked(self.solver, self.graph, self.nesting, &way, calling)
    }

    /// One solve for each candidate of the wrap search a partial solve told,
    /// laying the whole board one way with that candidate alone, all asked at
    /// once; nothing when it told none or the search is not split.
    fn tries(
        &self,
        partial: &Answer,
        stacking: bool,
        calling: &Calling,
    ) -> Result<Tries<S::Solve<'_>>, String> {
        let Some(search) = partial.wraps.as_ref().filter(|_| self.splits()) else {
            return Ok(None);
        };
        let (search, wraps) = wraps_asked(search)?;
        let tries = wraps
            .into_iter()
            .map(|wrap| {
                let way = wrapped_way(self.way, stacking, wrap);
                asked(self.solver, self.graph, self.nesting, &way, calling)
            })
            .collect();
        Ok(Some((search, tries)))
    }

    /// The board laid the way the partial solves' answers choose.
    async fn chosen(&self, (stacked, plain): (Answer, Answer)) -> Result<Rc<Drawing>, Unsolved> {
        let Some(stacking) = stacking_of(&stacked, &plain)? else {
            return Ok(drawing_of(plain)?);
        };
        let partial = if stacking { &stacked } else { &plain };
        let whole = Whole {
            unwrapped: self.unwrapped(stacking, self.calling),
            tries: self.tries(partial, stacking, self.calling)?,
        };
        kept_drawing(whole).await
    }

    /// The board laid both ways whole beside the partial solves, the way they
    /// choose kept and the other called off. A way's candidates are asked
    /// when its partial solve answers first, before the choice is known, and
    /// otherwise only when the choice keeps that way.
    async fn speculated<F>(&self, mut partials: Partials<F>) -> Result<Rc<Drawing>, Unsolved>
    where
        F: Future<Output = Result<Answer, Unsolved>>,
    {
        let callings = callings_under(self.calling);
        let mut wholes = [true, false].map(|stacking| Whole {
            unwrapped: self.unwrapped(stacking, &callings[usize::from(!stacking)]),
            tries: None,
        });
        let mut ask_tries = |at: usize, told: &Answer| -> Result<(), String> {
            wholes[at].tries = self.tries(told, at == 0, &callings[at])?;
            Ok(())
        };
        if let [Some(told), None] | [None, Some(told)] = &partials.told {
            ask_tries(usize::from(partials.told[0].is_none()), told)?;
        }
        let (stacked, plain) = poll_fn(|context| {
            let answered = match partials.progressed(context) {
                Ok(answered) => answered,
                Err(error) => return Poll::Ready(Err(error)),
            };
            if let Some(answers) = partials.answers() {
                return Poll::Ready(Ok(answers));
            }
            for at in answered {
                let told = partials.told[at]
                    .as_ref()
                    .expect("a partial solve answered");
                if let Err(error) = ask_tries(at, told) {
                    return Poll::Ready(Err(error.into()));
                }
            }
            Poll::Pending
        })
        .await?;
        let Some(stacking) = stacking_of(&stacked, &plain)? else {
            callings.iter().for_each(Calling::call_off);
            return Ok(drawing_of(plain)?);
        };
        let at = usize::from(!stacking);
        callings[1 - at].call_off();
        let [high, low] = wholes;
        let (mut whole, other, partial) = if stacking {
            (high, low, stacked)
        } else {
            (low, high, plain)
        };
        drop(other);
        if whole.tries.is_none() {
            whole.tries = self.tries(&partial, stacking, &callings[at])?;
        }
        kept_drawing(whole).await
    }
}

/// The whole board laid one way, wrapped at its first block that could stack
/// as that block's wrap search would wrap it. Without a search, the solve
/// with no wrap there gives the drawing. With one, each candidate's solve
/// answers what the search weighs it on, unless it sinks a card, and its
/// drawing only where it scores more than the block needs. Once every
/// candidate answered, the one the search keeps gives the drawing and the
/// solve with no wrap is called off; when it keeps none, the solve with no
/// wrap gives it. A failure answers at once and calls off every other solve.
async fn kept_drawing<W>(whole: Whole<W>) -> Result<Rc<Drawing>, Unsolved>
where
    W: Future<Output = Result<String, Unsolved>>,
{
    let Whole { unwrapped, tries } = whole;
    let Some((search, tries)) = tries else {
        return Ok(drawing_of(read(&unwrapped.await?)?)?);
    };
    let mut unwrapped = pin!(unwrapped);
    let mut early = None;
    let mut tried = pin!(try_all(tries));
    let tried = poll_fn(|context| {
        if early.is_none()
            && let Poll::Ready(answer) = unwrapped.as_mut().poll(context)
        {
            match answer {
                Ok(answer) => early = Some(answer),
                Err(error) => return Poll::Ready(Err(error)),
            }
        }
        tried.as_mut().poll(context)
    })
    .await?;
    let mut answers = tried
        .iter()
        .map(|told| read(told))
        .collect::<Result<Vec<_>, _>>()?;
    let weighings: Vec<Option<&str>> = answers
        .iter()
        .map(|answer| answer.wrapped.as_deref())
        .collect();
    if let Some(at) = wrap_kept(&search, &weighings)? {
        return Ok(drawing_of(answers.swap_remove(at))?);
    }
    let whole = match early {
        Some(whole) => whole,
        None => unwrapped.await?,
    };
    Ok(drawing_of(read(&whole)?)?)
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
