//! A Track solve through the crate's interface, with a stand-in for the
//! host's Graphviz: the solve answers a drawing that holds every card at its
//! measured size, and fails, asking no Graphviz, where it cannot lay out.

use archboard_layout::{Graphviz, lay_out_track};
use serde_json::{Value, json};

/// A Graphviz that stands every node of a graph in one column, a rank each,
/// and draws no edge.
#[derive(Default)]
struct Column {
    asked: usize,
}

/// Every node of a viz-js graph, its subgraphs' included.
fn nodes_of<'g>(graph: &'g Value, nodes: &mut Vec<&'g Value>) {
    nodes.extend(graph["nodes"].as_array().into_iter().flatten());
    for subgraph in graph["subgraphs"].as_array().into_iter().flatten() {
        nodes_of(subgraph, nodes);
    }
}

/// A node attribute in points, given in inches as a number or its spelling.
fn points(node: &Value, key: &str) -> f64 {
    let value = &node["attributes"][key];
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
        .unwrap_or(0.0)
        * 72.0
}

impl Graphviz for Column {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        self.asked += 1;
        let graph: Value = serde_json::from_str(graph).map_err(|error| error.to_string())?;
        let mut nodes = Vec::new();
        nodes_of(&graph, &mut nodes);
        let (mut width, mut height) = (0.0_f64, 0.0);
        let objects: Vec<Value> = nodes
            .iter()
            .map(|node| {
                let (across, down) = (points(node, "width"), points(node, "height"));
                let object = json!({ "name": node["name"], "pos": format!("{},{}", across / 2.0, height + down / 2.0) });
                width = width.max(across);
                height += down + 36.0;
                object
            })
            .collect();
        Ok(
            json!({ "bb": format!("0,0,{width},{height}"), "objects": objects, "edges": [] })
                .to_string(),
        )
    }
}

/// A Graphviz that refuses every graph.
struct Refusing;

impl Graphviz for Refusing {
    fn render(&mut self, _graph: &str) -> Result<String, String> {
        Err("syntax error".to_owned())
    }
}

/// A board of two cards, measured.
fn two_cards(options: Value) -> String {
    json!({
        "id": "root",
        "layoutOptions": options,
        "children": [
            { "id": "a", "width": 200, "height": 80 },
            { "id": "b", "width": 160, "height": 60 },
        ],
        "edges": [],
    })
    .to_string()
}

#[test]
fn every_card_stands_at_its_measured_size_inside_the_drawing() {
    let mut graphviz = Column::default();
    let answer: Value =
        serde_json::from_str(&lay_out_track(&two_cards(json!({})), &mut graphviz).unwrap())
            .unwrap();
    assert!(graphviz.asked > 0);
    let placed: Value = serde_json::from_str(
        answer["layoutOptions"]["archboard.blocks.placed"]
            .as_str()
            .unwrap(),
    )
    .unwrap();
    let boxes: Vec<&Value> = ["a", "b"]
        .iter()
        .map(|id| {
            &placed["cards"]
                .as_array()
                .unwrap()
                .iter()
                .find(|card| card["id"] == *id)
                .unwrap()["box"]
        })
        .collect();
    let number = |value: &Value| value.as_f64().unwrap();
    for (one, (width, height)) in boxes.iter().zip([(200.0, 80.0), (160.0, 60.0)]) {
        assert_eq!(
            (number(&one["width"]), number(&one["height"])),
            (width, height)
        );
        assert!(number(&one["x"]) + width <= number(&answer["width"]));
        assert!(number(&one["y"]) + height <= number(&answer["height"]));
    }
    let [one, other] = [boxes[0], boxes[1]];
    let apart = number(&one["y"]) + number(&one["height"]) <= number(&other["y"])
        || number(&other["y"]) + number(&other["height"]) <= number(&one["y"]);
    assert!(apart);
}

#[test]
fn a_solve_fails_when_graphviz_refuses_its_graph() {
    assert!(lay_out_track(&two_cards(json!({})), &mut Refusing).is_err());
}

#[test]
fn a_board_packed_as_blocks_is_refused_before_graphviz_is_asked() {
    let mut graphviz = Column::default();
    assert!(
        lay_out_track(
            &two_cards(json!({ "archboard.blocks.nesting": "blocks" })),
            &mut graphviz
        )
        .is_err()
    );
    assert_eq!(graphviz.asked, 0);
}
