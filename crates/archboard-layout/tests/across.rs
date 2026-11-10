//! A solve laid out across workers answers what one solve answers (ADR 0078):
//! a Blocks graph that takes a dense placement in parts, any other in one solve.

use std::cell::Cell;
use std::future::{Future, Ready, ready};
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use archboard_layout::{Solver, Unsolved, lay_out_across, lay_out_picture};
use serde_json::json;

/// A host that lays out each solve once it is asked, counts the solves, and
/// refuses every part when it fails parts.
#[derive(Default)]
struct Workers {
    asked: Cell<usize>,
    fails_parts: bool,
}

impl Solver for Workers {
    type Solve<'s> = Ready<Result<String, Unsolved>>;

    fn solve(&self, graph: String) -> Self::Solve<'_> {
        self.asked.set(self.asked.get() + 1);
        if self.fails_parts && graph.starts_with("{\"part\":") {
            return ready(Err(Unsolved::Failed("A worker stopped.".to_owned())));
        }
        ready(lay_out_picture(&graph, &mut archboard_graphviz::InCore).map_err(Unsolved::Failed))
    }
}

/// A graph's answer across a host's workers, and how many solves it asked for.
fn across(graph: &str, workers: &Workers) -> String {
    let mut laying = pin!(lay_out_across(workers, graph.to_owned()));
    let Poll::Ready(answer) = laying
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    else {
        panic!("a host that answers at once answers the layout at once");
    };
    answer.expect("a drawing")
}

/// One solve's answer.
fn whole(graph: &str) -> String {
    lay_out_picture(graph, &mut archboard_graphviz::InCore).expect("a drawing")
}

/// A crowded reading: eight cards, and three lines between each two of them.
fn crowded() -> String {
    let cards = (0..8).map(|at| json!({"id": format!("p{at}"), "width": 160, "height": 60}));
    let pairs = (0..8).flat_map(|from| (from + 1..8).map(move |to| (from, to)));
    let lines = pairs.flat_map(|(from, to)| {
        (0..3).map(move |copy| {
            json!({"id": format!("p{from}-p{to}-{copy}"),
                "sources": [format!("p{from}")], "targets": [format!("p{to}")]})
        })
    });
    json!({"id": "root", "layoutOptions": {"archboard.blocks.nesting": "blocks"},
        "children": cards.collect::<Vec<_>>(), "edges": lines.collect::<Vec<_>>()})
    .to_string()
}

#[test]
fn a_dense_reading_in_parts_answers_what_one_solve_answers() {
    for graph in [
        // Its trunks' words are taken off, and each routed try wears them again.
        include_str!("fixtures/trunk-words.json").to_owned(),
        // Its lines ask the placement for room, and it routes again.
        include_str!("fixtures/asks-room.json").to_owned(),
        // It scouts every way, and searches on with the cheapest scouts.
        crowded(),
        // No room, not even a wider one, draws it, so one solve places it with Graphviz.
        include_str!("fixtures/clear-approaches.json").to_owned(),
    ] {
        let workers = Workers::default();
        assert_eq!(across(&graph, &workers), whole(&graph));
        assert!(workers.asked.get() > 1);
    }
}

#[test]
fn a_reading_without_a_dense_placement_is_one_solve() {
    let cards = ["a", "b", "c"].map(|id| json!({"id": id, "width": 160, "height": 60}));
    let graph = json!({"id": "root", "layoutOptions": {"archboard.blocks.nesting": "blocks"},
        "children": cards,
        "edges": [{"id": "ab", "sources": ["a"], "targets": ["b"]},
                  {"id": "bc", "sources": ["b"], "targets": ["c"]}]})
    .to_string();
    let workers = Workers::default();
    assert_eq!(across(&graph, &workers), whole(&graph));
    assert_eq!(workers.asked.get(), 1);
}

#[test]
fn a_failed_part_leaves_the_answer_to_one_solve() {
    let graph = include_str!("fixtures/asks-room.json");
    let workers = Workers {
        fails_parts: true,
        ..Workers::default()
    };
    assert_eq!(across(graph, &workers), whole(graph));
}
