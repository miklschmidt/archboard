//! Lanes is Blocks' fallback placement, used every time: it never plans, and it draws a
//! reading Blocks draws by its fallback byte for byte, without line words.

mod common;

use archboard_layout::lay_out_picture;
use common::crowded_card;
use serde_json::{Value, json};

#[test]
fn lanes_takes_the_lanes_placement_where_blocks_plans() {
    for graph in [
        include_str!("fixtures/refused-dense.json"),
        include_str!("fixtures/trunk-words.json"),
    ] {
        let mut graph: Value = serde_json::from_str(graph).unwrap();
        let told = |graph: &Value| {
            let answer = lay_out_picture(&graph.to_string(), &mut archboard_graphviz::InCore)
                .expect("a drawing");
            let answer: Value = serde_json::from_str(&answer).expect("an answer");
            answer["layoutOptions"]
                .get("archboard.blocks.planned")
                .is_some()
        };
        assert!(told(&graph), "Blocks plans this reading");
        graph["layoutOptions"]["archboard.layout.engine"] = json!("lanes");
        assert!(!told(&graph), "Lanes never plans");
    }
}

/// What one solve answers for a graph: the drawing as it was written, and whether it was planned.
fn told(graph: &Value) -> (String, bool) {
    let answer =
        lay_out_picture(&graph.to_string(), &mut archboard_graphviz::InCore).expect("a drawing");
    let mut answer: Value = serde_json::from_str(&answer).expect("an answer");
    let options = answer["layoutOptions"]
        .as_object_mut()
        .expect("its options");
    let planned = options.contains_key("archboard.blocks.planned");
    let placed = options["archboard.blocks.placed"]
        .as_str()
        .expect("a drawing");
    (placed.to_owned(), planned)
}

#[test]
fn lanes_draws_a_reading_blocks_draws_by_its_fallback_byte_for_byte_without_line_words() {
    let mut graph: Value = serde_json::from_str(&crowded_card()).unwrap();
    let (blocks, planned) = told(&graph);
    assert!(!planned, "Blocks draws this reading by its fallback");
    graph["layoutOptions"]["archboard.layout.engine"] = json!("lanes");
    let (lanes, _) = told(&graph);
    assert_eq!(lanes, blocks);
    let drawn: Value = serde_json::from_str(&lanes).unwrap();
    let lines = drawn["edges"].as_array().expect("its lines");
    assert_ne!(lines.len(), 0);
    assert!(
        lines
            .iter()
            .all(|line| line.get("label").is_none_or(Value::is_null))
    );
}

#[test]
fn two_cables_with_the_same_strands_leave_a_card_from_separate_ports() {
    let mut graph = json!({
        "id": "root",
        "layoutOptions": { "archboard.layout.engine": "lanes" },
        "children": [
            { "id": "source", "width": 40, "height": 100 },
            { "id": "left", "width": 200, "height": 100 },
            { "id": "right", "width": 200, "height": 100 },
        ],
        "edges": [
            { "id": "one", "sources": ["source"], "targets": ["left"] },
            { "id": "two", "sources": ["source"], "targets": ["right"] },
        ],
    });
    for edge in graph["edges"].as_array_mut().expect("edges") {
        edge["layoutOptions"]["archboard.cable"] =
            json!("sync|mutation|unchanged|normal|off||;event|mutation|unchanged|normal|off||");
    }
    let (placed, planned) = told(&graph);
    assert!(!planned);
    let placed: Value = serde_json::from_str(&placed).expect("a placed drawing");
    let edges = placed["edges"].as_array().expect("placed edges");
    assert_ne!(edges[0]["points"][0], edges[1]["points"][0]);
}
