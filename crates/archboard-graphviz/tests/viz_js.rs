//! Graphviz in the core answers what viz-js answered.
//!
//! The fixture holds two graphs the layout asked Graphviz to lay out for
//! dogfood boards, with what viz-js 3.30 answered of each. Both lay out
//! differently under Apple's `qsort`, which graphviz-pure ports upstream, so
//! they hold the vendored copy to musl's tie order as well as the replay of
//! viz-js's cgraph calls. Each is answered twice, around the other, because an
//! answer must depend on its graph alone.

use std::fs;

use archboard_layout::Graphviz;
use serde::Deserialize;
use serde_json::{Value, json};

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
        let geometry = archboard_graphviz::InCore
            .render(&one.graph)
            .expect("the layout gets its geometry");
        assert_eq!(consumed(&geometry), consumed(&one.answer), "{}", one.drawn);
    }
}

/// The ordered geometry read by Track and Blocks, without json0's drawing attributes.
fn consumed(answer: &str) -> Value {
    let value: Value = serde_json::from_str(answer).expect("Graphviz answers JSON");
    let objects: Vec<_> = value["objects"]
        .as_array()
        .expect("the fixture has nodes")
        .iter()
        .filter(|object| object.get("pos").is_some() || is_cluster(object))
        .map(|object| json!({"name":object["name"],"pos":object["pos"],"bb":object["bb"]}))
        .collect();
    let edges: Vec<_> = value["edges"]
        .as_array()
        .expect("the fixture has edges")
        .iter()
        .filter(|edge| edge.get("id").is_some())
        .map(|edge| json!({"id":edge["id"],"pos":edge["pos"]}))
        .collect();
    json!({"bb":value["bb"],"objects":objects,"edges":edges})
}

/// These fixture clusters have the names that the layout gives Graphviz.
fn is_cluster(object: &Value) -> bool {
    object["name"]
        .as_str()
        .is_some_and(|name| name.starts_with("cluster"))
        && object.get("bb").is_some()
}
