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
use super::solving::Boxed;
use crate::json::J;

/// The blocks whose joins a layout keeps apart, by id, in the order they were set apart.
pub(crate) type Apart = Vec<String>;

/// Lay the drawing out with some blocks' joins apart.
pub(crate) type Lay<'a> = Box<dyn Fn(Apart) -> Boxed<'a, Result<Rc<Drawing>, String>> + 'a>;

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

/// One layout asked for: under way, answered, or failed.
enum Entry<'a> {
    Waiting(Boxed<'a, Result<Rc<Drawing>, String>>),
    Answered(Rc<Drawing>),
    Failed(String),
}

/// Each layout asked for, by the key of its blocks apart, laid out once
/// however often it is asked. A layout no turn to come reads is called off
/// while it is under way; one that answered or failed is kept.
struct Laying<'a> {
    lay: Lay<'a>,
    asked: IndexMap<String, Entry<'a>>,
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
        if !self.asked.contains_key(&key) {
            let layout = (self.lay)(apart.to_vec());
            self.asked.insert(key, Entry::Waiting(layout));
        }
    }

    /// Call off every layout under way that no turn to come reads.
    fn keep(&mut self, needed: &[Apart]) {
        let keys: Vec<String> = needed.iter().map(|apart| key_of(apart)).collect();
        self.asked
            .retain(|key, entry| !matches!(entry, Entry::Waiting(_)) || keys.contains(key));
    }

    /// A layout's answer, once it came.
    fn answered(&self, apart: &[String]) -> Option<Rc<Drawing>> {
        match self.asked.get(&key_of(apart)) {
            Some(Entry::Answered(drawing)) => Some(Rc::clone(drawing)),
            _ => None,
        }
    }

    /// Why a layout failed, once it did.
    fn failure(&self, apart: &[String]) -> Option<String> {
        match self.asked.get(&key_of(apart)) {
            Some(Entry::Failed(error)) => Some(error.clone()),
            _ => None,
        }
    }

    /// Move every layout under way on, and say whether any came or failed.
    fn progressed(&mut self, context: &mut Context<'_>) -> bool {
        let mut any = false;
        for entry in self.asked.values_mut() {
            let Entry::Waiting(layout) = entry else {
                continue;
            };
            if let Poll::Ready(answer) = layout.as_mut().poll(context) {
                *entry = answer.map_or_else(Entry::Failed, Entry::Answered);
                any = true;
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
