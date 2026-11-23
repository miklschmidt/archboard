//! Lanes lays every picture out on its lanes and never plans. Its look is a bus: no line words,
//! the lines between two cards in one bundle a lane apart, every card ranked with what it talks
//! to, inside a container or beside it, and every line on its page.

mod common;

use archboard_layout::lay_out_picture;
use common::crowded_card;
use serde_json::{Value, json};

/// The room between two lanes of a bus.
const LANE: f64 = 16.0;

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

/// What Lanes draws for a graph.
fn drawn_by_lanes(graph: &Value) -> Value {
    let mut graph = graph.clone();
    graph["layoutOptions"]["archboard.layout.engine"] = json!("lanes");
    let (placed, planned) = told(&graph);
    assert!(!planned, "Lanes never plans");
    serde_json::from_str(&placed).expect("a drawing")
}

/// Every point of a drawing's lines, by line.
fn lines_of(drawn: &Value) -> Vec<(String, Vec<(f64, f64)>)> {
    drawn["edges"]
        .as_array()
        .expect("its lines")
        .iter()
        .map(|line| {
            let points = line["points"]
                .as_array()
                .expect("its points")
                .iter()
                .map(|point| {
                    let at = |axis: &str| point[axis].as_f64().expect("a coordinate");
                    (at("x"), at("y"))
                })
                .collect();
            (line["id"].as_str().expect("an id").to_owned(), points)
        })
        .collect()
}

#[test]
fn lanes_draws_no_line_words_and_keeps_every_line_on_its_page() {
    for graph in [
        crowded_card(),
        include_str!("fixtures/readme-all.json").to_owned(),
    ] {
        let drawn = drawn_by_lanes(&serde_json::from_str(&graph).unwrap());
        let lines = drawn["edges"].as_array().expect("its lines");
        assert_ne!(lines.len(), 0);
        assert!(
            lines
                .iter()
                .all(|line| line.get("label").is_none_or(Value::is_null))
        );
        let (width, height) = (
            drawn["width"].as_f64().unwrap(),
            drawn["height"].as_f64().unwrap(),
        );
        for (id, points) in lines_of(&drawn) {
            assert!(
                points
                    .iter()
                    .all(|&(x, y)| (0.0..=width).contains(&x) && (0.0..=height).contains(&y)),
                "{id} stands on the page"
            );
        }
    }
}

#[test]
fn lanes_runs_the_lines_between_two_cards_as_one_bus_a_lane_apart() {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let lines = ["call", "http", "event"].iter().flat_map(|kind| {
        ["left", "right"].map(|to| {
            json!({"id":format!("{to} {kind}"),"sources":["caller"],"targets":[to],
                "layoutOptions":{"archboard.relationship.kind":kind,
                    "archboard.relationship.held-kind":kind}})
        })
    });
    let graph = json!({"id":"root","layoutOptions":{},
        "children":[card("caller"),card("left"),card("right")],
        "edges":lines.collect::<Vec<_>>()});
    let drawn = drawn_by_lanes(&graph);
    for to in ["left", "right"] {
        let mut heads: Vec<f64> = lines_of(&drawn)
            .into_iter()
            .filter(|(id, _)| id.starts_with(to))
            .map(|(_, points)| points.last().expect("a head").0)
            .collect();
        heads.sort_by(f64::total_cmp);
        assert_eq!(heads.len(), 3);
        assert!(
            heads
                .windows(2)
                .all(|pair| (pair[1] - pair[0] - LANE).abs() < 0.01),
            "the lines to {to} land a lane apart: {heads:?}"
        );
    }
}

#[test]
fn lanes_keeps_a_bundle_running_down_and_turns_the_one_line_against_it() {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let line = |id: &str, from: &str, to: &str, kind: &str| {
        json!({"id":id,"sources":[from],"targets":[to],
            "layoutOptions":{"archboard.relationship.kind":kind,
                "archboard.relationship.held-kind":kind}})
    };
    // The picture's order names the user first, so a walk from it turns the bundle.
    let graph = json!({"id":"root","layoutOptions":{},
    "children":[card("user"),card("caller")],
    "edges":[
        line("back","user","caller","event"),
        line("call","caller","user","call"),
        line("http","caller","user","http"),
        line("data","caller","user","data"),
    ]});
    let drawn = drawn_by_lanes(&graph);
    assert!(
        box_of(&drawn, "caller").1 <= box_of(&drawn, "user").0,
        "the three lines run down from the caller to the user"
    );
}

/// A container holding one card, a caller outside it and a card it calls outside it, drawn
/// with Lanes.
fn caller_and_callee_beside_a_container() -> Value {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let line = |id: &str, from: &str, to: &str| {
        json!({"id":id,"sources":[from],"targets":[to],
            "layoutOptions":{"archboard.relationship.kind":"call",
                "archboard.relationship.held-kind":"call"}})
    };
    json!({"id":"root","layoutOptions":{},
        "children":[
            card("caller"),
            {"id":"box","width":120,"height":36,
                "layoutOptions":{"archboard.header.size":"36"},
                "children":[card("inside")]},
            card("callee"),
        ],
        "edges":[line("in","caller","inside"),line("out","inside","callee")]})
}

/// The box a drawing gives an id: a card's or a container's.
fn box_of(drawn: &Value, id: &str) -> (f64, f64) {
    let held = drawn["cards"]
        .as_array()
        .into_iter()
        .chain(drawn["frames"].as_array())
        .flatten()
        .find(|item| item["id"] == id)
        .unwrap_or_else(|| panic!("{id} is drawn"));
    let top = held["box"]["y"].as_f64().expect("a top");
    (top, top + held["box"]["height"].as_f64().expect("a height"))
}

#[test]
fn lanes_stands_a_caller_above_a_container_and_what_it_calls_below() {
    let drawn = drawn_by_lanes(&caller_and_callee_beside_a_container());
    let (frame_top, frame_bottom) = box_of(&drawn, "box");
    assert!(
        box_of(&drawn, "caller").1 <= frame_top,
        "the caller stands above"
    );
    assert!(
        box_of(&drawn, "callee").0 >= frame_bottom,
        "the callee stands below"
    );
}

/// A card, as the tests draw it.
fn card(id: &str, width: u32) -> Value {
    json!({"id":id,"width":width,"height":60})
}

/// A line of one kind.
fn line(id: &str, from: &str, to: &str, kind: &str) -> Value {
    json!({"id":id,"sources":[from],"targets":[to],
        "layoutOptions":{"archboard.relationship.kind":kind,
            "archboard.relationship.held-kind":kind}})
}

#[test]
fn lanes_lands_the_lines_bound_for_one_card_together_a_lane_apart() {
    let graph = json!({"id":"root","layoutOptions":{},
    "children":[card("left",200),card("middle",200),card("right",200),card("target",900)],
    "edges":[
        line("from left","left","target","call"),
        line("from middle","middle","target","http"),
        line("from right","right","target","event"),
    ]});
    let drawn = drawn_by_lanes(&graph);
    let mut heads: Vec<f64> = lines_of(&drawn)
        .into_iter()
        .map(|(_, points)| points.last().expect("a head").0)
        .collect();
    heads.sort_by(f64::total_cmp);
    assert!(
        heads
            .windows(2)
            .all(|pair| (pair[1] - pair[0] - LANE).abs() < 0.01),
        "the heads stand together a lane apart: {heads:?}"
    );
}

#[test]
fn lanes_runs_no_line_round_the_outside_of_the_readme_reading() {
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/readme-all.json")).unwrap());
    let boxes: Vec<(f64, f64)> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| {
            let x = card["box"]["x"].as_f64().expect("an x");
            (x, x + card["box"]["width"].as_f64().expect("a width"))
        })
        .collect();
    let left = boxes.iter().map(|one| one.0).fold(f64::INFINITY, f64::min);
    let right = boxes
        .iter()
        .map(|one| one.1)
        .fold(f64::NEG_INFINITY, f64::max);
    for (id, points) in lines_of(&drawn) {
        assert!(
            points
                .iter()
                .all(|&(x, _)| x >= left - 1.0 && x <= right + 1.0),
            "{id} runs between the outermost cards"
        );
    }
}

#[test]
fn lanes_stands_a_card_a_container_calls_beside_the_member_that_calls_it() {
    // One routing for the whole picture: the card stands a rank below its caller inside the
    // container, beside the container's lower rows, not below all of it.
    let graph = json!({"id":"root","layoutOptions":{},
    "children":[
        {"id":"box","width":120,"height":36,
            "layoutOptions":{"archboard.header.size":"36"},
            "children":[card("first",200),card("second",200),card("third",200)]},
        card("called",200),
    ],
    "edges":[
        line("down","first","second","call"),
        line("further","second","third","call"),
        line("out","first","called","http"),
    ]});
    let drawn = drawn_by_lanes(&graph);
    assert!(
        box_of(&drawn, "called").0 < box_of(&drawn, "box").1,
        "the called card stands beside the container"
    );
}
