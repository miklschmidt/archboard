//! A solve through the crate's interface: the solve answers a drawing that
//! holds every card at its measured size and joins every line to its cards.

use archboard_layout::{Graphviz, lay_out_picture};
use serde_json::{Value, json};

/// A Graphviz that counts the graphs it is asked to lay out and refuses each.
#[derive(Default)]
struct Counting {
    asked: usize,
}

impl Graphviz for Counting {
    fn render(&mut self, _graph: &str) -> Result<String, String> {
        self.asked += 1;
        Err("not laid out here".to_owned())
    }
}

/// A picture measured: two containers holding a card each, and a call from one
/// card to the other.
fn two_containers() -> String {
    let container = |id: &str, card: Value| {
        json!({
            "id": id,
            "width": 300,
            "height": 60,
            "layoutOptions": { "archboard.header.size": "60" },
            "children": [card],
        })
    };
    json!({
        "id": "root",
        "children": [
            container("one", json!({ "id": "a", "width": 200, "height": 80 })),
            container("other", json!({ "id": "b", "width": 160, "height": 60 })),
        ],
        "edges": [{
            "id": "ab",
            "sources": ["a"],
            "targets": ["b"],
            "layoutOptions": { "archboard.relationship.kind": "call" },
        }],
    })
    .to_string()
}

/// The drawing a solve answered, and the answer.
fn placed_of(answer: &str) -> Option<(Value, Value)> {
    let answer: Value = serde_json::from_str(answer).ok()?;
    let placed =
        serde_json::from_str(answer["layoutOptions"]["archboard.blocks.placed"].as_str()?).ok()?;
    Some((answer, placed))
}

/// A number of the drawing; not a number where there is none, which no comparison holds.
fn number(value: &Value) -> f64 {
    value.as_f64().unwrap_or(f64::NAN)
}

/// Whether a point stands on a box's edge.
fn on_edge(point: &Value, at: &Value) -> bool {
    let (x, y) = (number(&point["x"]), number(&point["y"]));
    let (left, top) = (number(&at["x"]), number(&at["y"]));
    let (right, bottom) = (left + number(&at["width"]), top + number(&at["height"]));
    let within = x >= left - 0.5 && x <= right + 0.5 && y >= top - 0.5 && y <= bottom + 0.5;
    let edge = [x - left, right - x, y - top, bottom - y]
        .iter()
        .any(|gap| gap.abs() < 0.5);
    within && edge
}

#[test]
fn every_card_stands_at_its_measured_size_and_its_line_runs_from_card_to_card() {
    let mut graphviz = Counting::default();
    let (answer, placed) =
        placed_of(&lay_out_picture(&two_containers(), &mut graphviz).unwrap()).unwrap();
    // Two flat frames are a dense drawing, which needs no Graphviz.
    assert_eq!(graphviz.asked, 0);
    let cards = placed["cards"].as_array().unwrap();
    let box_of = |id: &str| &cards.iter().find(|card| card["id"] == id).unwrap()["box"];
    let inside = |one: &Value, (width, height): (f64, f64)| {
        (number(&one["width"]), number(&one["height"])) == (width, height)
            && number(&one["x"]) + width <= number(&answer["width"])
            && number(&one["y"]) + height <= number(&answer["height"])
    };
    let [one, other] = [box_of("a"), box_of("b")];
    assert!(inside(one, (200.0, 80.0)) && inside(other, (160.0, 60.0)));
    let points = placed["edges"][0]["points"].as_array().unwrap();
    assert!(
        on_edge(&points[0], one) && on_edge(&points[points.len() - 1], other),
        "{points:?}, source {one}, target {other}"
    );
}
