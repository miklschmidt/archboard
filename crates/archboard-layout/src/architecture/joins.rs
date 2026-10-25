//! The joins choice laid out side by side. Lines that join on the way to one
//! card stay one line into it: each such join is kept whole by its labels
//! before the join, or by its lines keeping ports of their own, and each
//! block whose joins would move labels takes the way that reads better in the
//! drawing as a whole. Every layout the choice reads, as far as the layouts
//! answered so far decide, is asked for at once, and weighed as each comes,
//! in the order laying them out one by one weighs them, so the drawing is the
//! one that order gives.

use std::collections::HashMap;
use std::future::poll_fn;
use std::rc::Rc;
use std::task::{Context, Poll};

use indexmap::IndexMap;

use super::choosing::{Drawing, better};
use super::solving::{Boxed, Calling, Unsolved};
use crate::json::J;

/// The blocks whose joins a layout keeps apart, by id, in the order they were set apart.
pub(crate) type Apart = Vec<String>;

/// Lay the drawing out with some blocks' joins apart, called off by the [`Calling`] given.
pub(crate) type Lay<'a> =
    Box<dyn Fn(Apart, Calling) -> Boxed<'a, Result<Rc<Drawing>, Unsolved>> + 'a>;

/// The same key for a set of blocks apart, whatever their order.
fn key_of(apart: &[String]) -> String {
    let mut sorted = apart.to_vec();
    sorted.sort();
    J::Arr(sorted.iter().map(|id| J::str(id)).collect()).text()
}

/// A set with one member taken out, or put in when it was not there.
fn toggled(apart: &[String], member: &str) -> Apart {
    let mut next = apart.to_vec();
    match next.iter().position(|held| held == member) {
        Some(at) => {
            next.remove(at);
        }
        None => next.push(member.to_owned()),
    }
    next
}

/// Where one layout asked for is: under way, answered, or failed.
enum State<'a> {
    Waiting(Boxed<'a, Result<Rc<Drawing>, Unsolved>>),
    Answered(Rc<Drawing>),
    Failed(String),
}

/// One layout asked for: its blocks apart, what calls it off, whether a turn
/// to come weighs it, and where it is.
struct Asked<'a> {
    apart: Apart,
    calling: Calling,
    needed: bool,
    state: State<'a>,
}

/// Each layout asked for, by the key of its blocks apart, laid out once
/// however often it is asked. A layout no turn to come weighs is called off
/// and kept: one an engine already lays out answers all the same, and a later
/// turn shares that answer, or its failure. One its host refused because it
/// was called off is forgotten, and laid out afresh while a turn weighs it.
struct Laying<'a> {
    lay: Lay<'a>,
    asked: IndexMap<String, Asked<'a>>,
}

impl<'a> Laying<'a> {
    fn new(lay: Lay<'a>) -> Self {
        Laying {
            lay,
            asked: IndexMap::new(),
        }
    }

    /// Ask for a layout, once.
    fn ask(&mut self, apart: &[String]) {
        let key = key_of(apart);
        if let Some(asked) = self.asked.get_mut(&key) {
            asked.needed = true;
            return;
        }
        let calling = Calling::default();
        let layout = (self.lay)(apart.to_vec(), calling.clone());
        self.asked.insert(
            key,
            Asked {
                apart: apart.to_vec(),
                calling,
                needed: true,
                state: State::Waiting(layout),
            },
        );
    }

    /// Call off every layout that no turn to come weighs.
    fn keep(&mut self, needed: &[Apart]) {
        let keys: Vec<String> = needed.iter().map(|apart| key_of(apart)).collect();
        for (key, asked) in &mut self.asked {
            asked.needed = keys.contains(key);
            if !asked.needed {
                asked.calling.call_off();
            }
        }
    }

    /// A layout's answer, once it came.
    fn answered(&self, apart: &[String]) -> Option<Rc<Drawing>> {
        match self.asked.get(&key_of(apart)).map(|asked| &asked.state) {
            Some(State::Answered(drawing)) => Some(Rc::clone(drawing)),
            _ => None,
        }
    }

    /// Why a layout failed, once it did.
    fn failure(&self, apart: &[String]) -> Option<String> {
        match self.asked.get(&key_of(apart)).map(|asked| &asked.state) {
            Some(State::Failed(error)) => Some(error.clone()),
            _ => None,
        }
    }

    /// Move every layout under way on, and say whether any came, failed or
    /// was refused. A refused layout a turn to come weighs is asked for
    /// afresh.
    fn progressed(&mut self, context: &mut Context<'_>) -> bool {
        let mut any = false;
        let mut refused = Vec::new();
        for (key, asked) in &mut self.asked {
            let State::Waiting(layout) = &mut asked.state else {
                continue;
            };
            if let Poll::Ready(answer) = layout.as_mut().poll(context) {
                any = true;
                match answer {
                    Ok(drawing) => asked.state = State::Answered(drawing),
                    Err(Unsolved::Failed(error)) => asked.state = State::Failed(error),
                    Err(Unsolved::CalledOff) => refused.push(key.clone()),
                }
            }
        }
        for key in refused {
            if let Some(asked) = self.asked.shift_remove(&key)
                && asked.needed
            {
                self.ask(&asked.apart);
            }
        }
        any
    }
}

/// What the joins choice waits for next, or the drawing it chose.
enum Next {
    Wait { apart: Apart, facing: bool },
    Chosen(Rc<Drawing>),
}

/// What the joins choice reads next: the layouts it weighs, the layout facing
/// the blocks' walls it weighs, and what it waits for or chose.
struct Weighing {
    needed: Vec<Apart>,
    faced: Vec<Apart>,
    next: Next,
}

/// A turn of the joins choice: from the blocks apart in the drawing kept, the blocks apart to try.
type Turn = Box<dyn Fn(&[String]) -> Apart>;

/// The turns of the joins choice: every join apart, where more than one
/// block joins, and then each block's joins turned the other way in turn.
fn turns_of(joining: &[String]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();
    if joining.len() > 1 {
        let every = joining.to_vec();
        turns.push(Box::new(move |_: &[String]| every.clone()));
    }
    for block in joining {
        let block = block.clone();
        turns.push(Box::new(move |apart: &[String]| toggled(apart, &block)));
    }
    turns
}

/// Whether one drawing reads better than another, each pair weighed once.
#[derive(Default)]
struct Once {
    known: HashMap<(*const Drawing, *const Drawing), bool>,
}

impl Once {
    fn better(&mut self, one: &Rc<Drawing>, other: &Rc<Drawing>) -> Result<bool, String> {
        let pair = (Rc::as_ptr(one), Rc::as_ptr(other));
        if let Some(found) = self.known.get(&pair) {
            return Ok(*found);
        }
        let answer = better(one, other)?;
        self.known.insert(pair, answer);
        Ok(answer)
    }
}

/// The turns weighed so far: every layout they read, the drawing kept, its
/// blocks apart, and the first layout they wait for.
struct Turned {
    needed: Vec<Apart>,
    best: Rc<Drawing>,
    apart: Apart,
    waits: Option<Next>,
}

/// Weigh each turn from the drawing kept, kept where it reads better. A turn
/// whose layout has not come is waited for and read as if it read worse:
/// the turns after it are then the ones it would weigh.
fn turned(
    turns: &[Turn],
    laying: &Laying<'_>,
    once: &mut Once,
    first: Rc<Drawing>,
) -> Result<Turned, String> {
    let mut held = Turned {
        needed: vec![Vec::new()],
        best: first,
        apart: Vec::new(),
        waits: None,
    };
    for turn in turns {
        let trial = turn(&held.apart);
        held.needed.push(trial.clone());
        match laying.answered(&trial) {
            None => {
                held.waits.get_or_insert(Next::Wait {
                    apart: trial,
                    facing: false,
                });
            }
            Some(placed) => {
                if once.better(&placed, &held.best)? {
                    held.best = placed;
                    held.apart = trial;
                }
            }
        }
    }
    Ok(held)
}

/// The turns weighed, and last the drawing kept laid out facing its blocks'
/// walls where that would change it, kept where it reads better.
fn faced_choice(
    turns: Turned,
    faced: Option<&Laying<'_>>,
    once: &mut Once,
) -> Result<Weighing, String> {
    let Turned {
        needed,
        best,
        apart,
        waits,
    } = turns;
    let Some(faced) = faced.filter(|_| best.faces()) else {
        return Ok(Weighing {
            needed,
            faced: Vec::new(),
            next: waits.unwrap_or(Next::Chosen(best)),
        });
    };
    let Some(placed) = faced.answered(&apart) else {
        let next = waits.unwrap_or_else(|| Next::Wait {
            apart: apart.clone(),
            facing: true,
        });
        return Ok(Weighing {
            needed,
            faced: vec![apart],
            next,
        });
    };
    let chosen = if once.better(&placed, &best)? {
        placed
    } else {
        best
    };
    Ok(Weighing {
        needed,
        faced: vec![apart],
        next: waits.unwrap_or(Next::Chosen(chosen)),
    })
}

/// Weigh the joins as far as the layouts answered so far decide: every join
/// before its labels; then each turn from the drawing kept; last, the drawing
/// kept facing its blocks' walls. Until the first layout comes, the choice
/// waits for it and reads the turns from it.
fn weighed(
    turns: &[Turn],
    laying: &Laying<'_>,
    faced: Option<&Laying<'_>>,
    once: &mut Once,
) -> Result<Weighing, String> {
    let none: Apart = Vec::new();
    let Some(first) = laying.answered(&none) else {
        return Ok(Weighing {
            needed: std::iter::once(none.clone())
                .chain(turns.iter().map(|turn| turn(&none)))
                .collect(),
            faced: if faced.is_some() {
                vec![none.clone()]
            } else {
                Vec::new()
            },
            next: Next::Wait {
                apart: none,
                facing: false,
            },
        });
    };
    faced_choice(turned(turns, laying, once, first)?, faced, once)
}

/// Ask for the layouts a weighing reads, and call off the ones asked for before that it no longer reads.
fn asking_only(laying: &mut Laying<'_>, needed: &[Apart]) {
    laying.keep(needed);
    for apart in needed {
        laying.ask(apart);
    }
}

/// Lay a drawing out with every join kept whole the way that reads better.
/// Every layout the weighing reads is asked for at once, so they are laid
/// out side by side; each answer that comes is weighed, and the layouts no
/// longer read are called off. When the drawing is chosen, or a layout it
/// waits for fails, every layout still under way is called off.
pub(crate) async fn lay_joined<'a>(
    joining: &[String],
    lay: Lay<'a>,
    face: Option<Lay<'a>>,
) -> Result<Rc<Drawing>, String> {
    let mut laying = Laying::new(lay);
    let mut faced = face.map(Laying::new);
    let turns = turns_of(joining);
    let mut once = Once::default();
    loop {
        let weighing = weighed(&turns, &laying, faced.as_ref(), &mut once)?;
        asking_only(&mut laying, &weighing.needed);
        if let Some(faced) = faced.as_mut() {
            asking_only(faced, &weighing.faced);
        }
        let (apart, facing) = match weighing.next {
            Next::Chosen(drawing) => return Ok(drawing),
            Next::Wait { apart, facing } => (apart, facing),
        };
        poll_fn(|context| answer_or_failure(&mut laying, faced.as_mut(), &apart, facing, context))
            .await?;
    }
}

/// Wait until a layout comes or fails; fail where the layout waited for failed.
fn answer_or_failure<'a>(
    laying: &mut Laying<'a>,
    mut faced: Option<&mut Laying<'a>>,
    apart: &[String],
    facing: bool,
    context: &mut Context<'_>,
) -> Poll<Result<(), String>> {
    let laid = laying.progressed(context);
    let faces = faced
        .as_deref_mut()
        .is_some_and(|faced| faced.progressed(context));
    let waited = if facing {
        faced.as_deref()
    } else {
        Some(&*laying)
    };
    if let Some(error) = waited.and_then(|held| held.failure(apart)) {
        return Poll::Ready(Err(error));
    }
    if laid || faces {
        Poll::Ready(Ok(()))
    } else {
        Poll::Pending
    }
}
