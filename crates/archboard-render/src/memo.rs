//! The layouts a renderer remembers: each distinct board, engine and
//! comparison laid out once, the least recently used forgotten first. A
//! layout under way is shared: a second render of the same board waits for
//! the first one's layout rather than laying it out again. A failed layout is
//! not remembered, so the next render tries again.

use std::cell::RefCell;
use std::future::{Future, poll_fn};
use std::rc::Rc;
use std::task::{Poll, Waker};

use archboard_scene::drawing::Painted;
use indexmap::IndexMap;

/// How many distinct layouts are remembered across boards, variants and comparisons.
const REMEMBERED_LAYOUTS: usize = 64;

/// What a layout answered.
type Answer = Result<Rc<Painted>, String>;

/// A layout under way, and the renders waiting for it.
#[derive(Debug, Default)]
struct Waiting {
    answer: Option<Answer>,
    wakers: Vec<Waker>,
}

/// One remembered layout: laid, or under way.
#[derive(Debug)]
enum Remembered {
    Laid(Rc<Painted>),
    Laying(Rc<RefCell<Waiting>>),
}

/// The layouts remembered, by what they were laid out from, least recently
/// used first.
#[derive(Debug, Default)]
pub(crate) struct Layouts {
    held: RefCell<IndexMap<String, Remembered>>,
}

/// Settles a layout under way when its render ends: with its answer, or,
/// for a render dropped before it had one, as called off.
struct Settling<'a> {
    layouts: &'a Layouts,
    key: &'a str,
    waiting: Rc<RefCell<Waiting>>,
    answer: Option<Answer>,
}

impl Drop for Settling<'_> {
    fn drop(&mut self) {
        let answer = self
            .answer
            .take()
            .unwrap_or_else(|| Err("The layout was called off.".to_owned()));
        let mut held = self.layouts.held.borrow_mut();
        let ours = matches!(held.get(self.key), Some(Remembered::Laying(laying)) if Rc::ptr_eq(laying, &self.waiting));
        if ours {
            match &answer {
                Ok(painted) => {
                    held.insert(self.key.to_owned(), Remembered::Laid(Rc::clone(painted)));
                }
                Err(_) => {
                    held.shift_remove(self.key);
                }
            }
        }
        drop(held);
        let mut waiting = self.waiting.borrow_mut();
        waiting.answer = Some(answer);
        for waker in waiting.wakers.drain(..) {
            waker.wake();
        }
    }
}

impl Layouts {
    /// What is remembered under a key, now the most recently used.
    fn recall(&self, key: &str) -> Option<Remembered> {
        let mut held = self.held.borrow_mut();
        let (_, remembered) = held.shift_remove_entry(key)?;
        let again = match &remembered {
            Remembered::Laid(painted) => Remembered::Laid(Rc::clone(painted)),
            Remembered::Laying(waiting) => Remembered::Laying(Rc::clone(waiting)),
        };
        held.insert(key.to_owned(), remembered);
        Some(again)
    }

    /// A layout under way, now remembered, the oldest forgotten past the limit.
    fn begin(&self, key: &str) -> Rc<RefCell<Waiting>> {
        let waiting = Rc::new(RefCell::new(Waiting::default()));
        let mut held = self.held.borrow_mut();
        held.insert(key.to_owned(), Remembered::Laying(Rc::clone(&waiting)));
        while held.len() > REMEMBERED_LAYOUTS {
            held.shift_remove_index(0);
        }
        waiting
    }

    /// The layout remembered under a key, or the one `lay` answers, remembered.
    pub(crate) async fn laid<F>(&self, key: &str, lay: F) -> Answer
    where
        F: Future<Output = Result<Painted, String>>,
    {
        match self.recall(key) {
            Some(Remembered::Laid(painted)) => return Ok(painted),
            Some(Remembered::Laying(waiting)) => return answer_of(&waiting).await,
            None => {}
        }
        let waiting = self.begin(key);
        let mut settling = Settling {
            layouts: self,
            key,
            waiting,
            answer: None,
        };
        let answer = lay.await.map(Rc::new);
        settling.answer = Some(answer.clone());
        drop(settling);
        answer
    }
}

/// The answer of a layout another render has under way, once it has one.
async fn answer_of(waiting: &Rc<RefCell<Waiting>>) -> Answer {
    poll_fn(|context| {
        let mut waiting = waiting.borrow_mut();
        if let Some(answer) = &waiting.answer {
            return Poll::Ready(answer.clone());
        }
        waiting.wakers.push(context.waker().clone());
        Poll::Pending
    })
    .await
}
