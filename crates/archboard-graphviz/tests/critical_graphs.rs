//! Graphviz answers the graphs of the slowest first renders as it answered them before
//! graphviz-pure was made faster for them (TASK-548.07).
//!
//! The fixture holds one graph of the critical solve of Agent workbench and one of Board
//! viewer, each with an FNV-1a hash of the answer that commit b39ce7afa gave it. The
//! graphs have clusters, wide ranks and long routes, so their answers go through every
//! part of crossing reduction, network simplex and routing that was rewritten for speed.

use std::fs;

use serde::Deserialize;

/// One graph and the hash of its answer.
#[derive(Debug, Deserialize)]
struct Answered {
    drawn: String,
    graph: String,
    answer_fnv1a: String,
}

/// The 64-bit FNV-1a hash of a text, in hexadecimal.
fn fnv1a(text: &str) -> String {
    let hash = text.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    });
    format!("{hash:016x}")
}

#[test]
fn the_critical_graphs_get_the_answers_they_got_before() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/critical-graphs.json"
    );
    let answered: Vec<Answered> =
        serde_json::from_str(&fs::read_to_string(path).expect("the fixture is there"))
            .expect("the fixture reads");
    for one in &answered {
        let answer = archboard_graphviz::render(&one.graph).expect("Graphviz lays it out");
        assert!(
            fnv1a(&answer) == one.answer_fnv1a,
            "{} is answered otherwise",
            one.drawn
        );
    }
}
