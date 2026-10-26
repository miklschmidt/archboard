//! Graphviz in the core answers what viz-js answered.
//!
//! The fixture holds two graphs the layout asked Graphviz to lay out for
//! dogfood boards, with what viz-js 3.30 answered of each. Both lay out
//! differently under Apple's `qsort`, which graphviz-pure ports upstream, so
//! they hold the vendored copy to musl's tie order as well as the replay of
//! viz-js's cgraph calls. Each is answered twice, around the other, because an
//! answer must depend on its graph alone.

use std::fs;

use serde::Deserialize;

/// One graph and viz-js's answer.
#[derive(Debug, Deserialize)]
struct Answered {
    drawn: String,
    graph: String,
    answer: String,
}

#[test]
fn each_graph_is_answered_as_viz_js_answered_it_whatever_was_laid_out_before() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/viz-js-answers.json"
    );
    let answered: Vec<Answered> =
        serde_json::from_str(&fs::read_to_string(path).expect("the fixture is there"))
            .expect("the fixture reads");
    for one in answered.iter().chain(&answered) {
        let answer = archboard_graphviz::render(&one.graph).expect("Graphviz lays it out");
        assert!(answer == one.answer, "{} is answered otherwise", one.drawn);
    }
}
