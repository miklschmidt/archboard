//! The layout's binding: one solve of a board, Track or Blocks, its measured
//! graph in and its answer out, each as JSON. A host's layout engine runs it
//! for each solve a render asks for (`crate::render`). Graphviz runs in the
//! core (`archboard_graphviz`, ADR 0058), so a solve asks its host for nothing.
//!
//! An instance remembers the Graphviz answers of its earlier solves, and those
//! its host hands it from other instances (`rememberGraphvizAnswers`), so a
//! graph laid out once is not laid out again (TASK-548.02). Graphviz's answer
//! depends on its graph alone (ADR 0058), so a remembered answer is the answer,
//! and which answers an instance holds never changes a drawing.

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;

use wasm_bindgen::prelude::*;

/// The most text an instance's remembered Graphviz answers hold, graphs and
/// answers together, in bytes: 32 MiB. The first render of a wide board, such
/// as Agent workbench, lays out about 9 MB of it, so it holds the answers of
/// three or more wide boards. Past it, the answers remembered first are
/// forgotten first, and a forgotten graph is laid out again, to the same answer.
const REMEMBERED_BYTES: usize = 32 << 20;

/// Graphviz answers by their graphs, in the order they were remembered, within a bound.
#[derive(Debug)]
struct Remembered {
    answers: HashMap<Rc<str>, Rc<str>>,
    order: VecDeque<Rc<str>>,
    bytes: usize,
    bound: usize,
}

impl Remembered {
    /// Nothing remembered yet, holding at most `bound` bytes.
    fn new(bound: usize) -> Remembered {
        Remembered {
            answers: HashMap::new(),
            order: VecDeque::new(),
            bytes: 0,
            bound,
        }
    }

    /// The answer remembered for a graph.
    fn get(&self, graph: &str) -> Option<Rc<str>> {
        self.answers.get(graph).cloned()
    }

    /// Remember a graph's answer, forgetting the oldest ones past the bound.
    /// One larger than the whole bound is not remembered.
    fn remember(&mut self, graph: &str, answer: Rc<str>) {
        let size = graph.len() + answer.len();
        if size > self.bound || self.answers.contains_key(graph) {
            return;
        }
        while self.bytes + size > self.bound {
            let Some(oldest) = self.order.pop_front() else {
                break;
            };
            if let Some(forgotten) = self.answers.remove(&oldest) {
                self.bytes -= oldest.len() + forgotten.len();
            }
        }
        let graph: Rc<str> = graph.into();
        self.order.push_back(Rc::clone(&graph));
        self.answers.insert(graph, answer);
        self.bytes += size;
    }
}

thread_local! {
    /// This instance's remembered answers. A WebAssembly instance runs on one thread.
    static REMEMBERED: RefCell<Remembered> = RefCell::new(Remembered::new(REMEMBERED_BYTES));
}

/// Graphviz in the core, answering a graph it remembers from what it remembered,
/// and telling `learned` each graph it laid out and its answer.
struct Remembering {
    learned: Option<js_sys::Array>,
}

impl archboard_layout::Graphviz for Remembering {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        if let Some(answer) = REMEMBERED.with_borrow(|remembered| remembered.get(graph)) {
            return Ok(answer.as_ref().to_owned());
        }
        let answer = archboard_graphviz::render(graph)?;
        if let Some(learned) = &self.learned {
            learned.push(&JsValue::from_str(graph));
            learned.push(&JsValue::from_str(&answer));
        }
        REMEMBERED.with_borrow_mut(|remembered| remembered.remember(graph, answer.as_str().into()));
        Ok(answer)
    }
}

/// What a value the host threw or refused with says.
pub(crate) fn said(error: &JsValue, what: &str) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| error.as_string())
        .unwrap_or_else(|| format!("{what} failed without saying why"))
}

/// Lay a measured board out one way (`archboard_layout::lay_out_board`).
/// Each graph Graphviz lays out on the way, and its answer, is pushed onto
/// `learned`, when given, graph then answer, also when the solve fails.
///
/// # Errors
///
/// A graph or options the layout cannot read, and a block's graph Graphviz refused.
#[wasm_bindgen(js_name = layOutBoard)]
pub fn lay_out_board(graph: &str, learned: Option<js_sys::Array>) -> Result<String, JsValue> {
    let mut graphviz = Remembering { learned };
    archboard_layout::lay_out_board(graph, &mut graphviz)
        .map_err(|error| JsError::new(&error).into())
}

/// Remember Graphviz answers another instance learned, given as `layOutBoard`
/// pushes them: graph then answer, pair after pair. A pair that is not two
/// strings is ignored.
#[wasm_bindgen(js_name = rememberGraphvizAnswers)]
pub fn remember_graphviz_answers(pairs: &js_sys::Array) {
    REMEMBERED.with_borrow_mut(|remembered| {
        let mut pairs = pairs.iter().map(|text| text.as_string());
        while let (Some(graph), Some(answer)) = (pairs.next(), pairs.next()) {
            if let (Some(graph), Some(answer)) = (graph, answer) {
                remembered.remember(&graph, answer.into());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::Remembered;

    #[test]
    fn remembered_answers_past_their_bound_forget_the_oldest() {
        let mut remembered = Remembered::new(10);
        remembered.remember("a", "1234".into());
        remembered.remember("b", "1234".into());
        remembered.remember("c", "1234".into());
        assert!(remembered.get("a").is_none());
        assert_eq!(remembered.get("c").as_deref(), Some("1234"));
        assert!(remembered.bytes <= 10);
    }

    #[test]
    fn an_answer_larger_than_the_bound_is_not_remembered() {
        let mut remembered = Remembered::new(10);
        remembered.remember("c", "1234".into());
        remembered.remember("d", "12345678901".into());
        assert!(remembered.get("d").is_none());
        assert_eq!(remembered.get("c").as_deref(), Some("1234"));
    }
}
