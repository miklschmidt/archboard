//! A solve through the crate's interface, with a stand-in for the host's
//! Graphviz: drawn inline or packed as blocks, the solve answers a drawing
//! that holds every card at its measured size and joins every line to its
//! cards, and fails, asking no Graphviz, where it cannot lay out.

use archboard_layout::{Graphviz, lay_out_board};
use serde_json::{Value, json};

/// A Graphviz that stands every node of a graph in one column, a rank each,
/// puts each cluster round its nodes, and draws no edge.
#[derive(Default)]
struct Column {
    asked: usize,
    ranked: Vec<(String, String)>,
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
        self.ranked.extend(
            graph["edges"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|edge| {
                    Some((
                        edge["tail"].as_str()?.to_owned(),
                        edge["head"].as_str()?.to_owned(),
                    ))
                }),
        );
        let mut nodes = Vec::new();
        nodes_of(&graph, &mut nodes);
        let (mut width, mut height) = (0.0_f64, 0.0);
        let mut spans = Vec::new();
        let mut objects: Vec<Value> = nodes
            .iter()
            .map(|node| {
                let (across, down) = (points(node, "width"), points(node, "height"));
                let object = json!({ "name": node["name"], "pos": format!("{},{}", across / 2.0, height + down / 2.0) });
                spans.push((node["name"].clone(), across, height, height + down));
                width = width.max(across);
                height += down + 36.0;
                object
            })
            .collect();
        clusters_of(&graph, &spans, &mut objects);
        Ok(
            json!({ "bb": format!("0,0,{width},{height}"), "objects": objects, "edges": [] })
                .to_string(),
        )
    }
}

/// Each cluster of a graph as Graphviz answers it: its box round the nodes
/// it holds, however deep, a few points out.
fn clusters_of(graph: &Value, spans: &[(Value, f64, f64, f64)], objects: &mut Vec<Value>) {
    for subgraph in graph["subgraphs"].as_array().into_iter().flatten() {
        let mut held = Vec::new();
        nodes_of(subgraph, &mut held);
        let inside: Vec<_> = spans
            .iter()
            .filter(|span| held.iter().any(|node| node["name"] == span.0))
            .collect();
        if let (Some(_), Some(first), Some(last)) =
            (subgraph["name"].as_str(), inside.first(), inside.last())
        {
            let across = inside.iter().fold(0.0_f64, |most, span| most.max(span.1));
            objects.push(json!({
                "name": subgraph["name"],
                "bb": format!("-8,{},{},{}", first.2 - 8.0, across + 8.0, last.3 + 8.0),
            }));
        }
        clusters_of(subgraph, spans, objects);
    }
}

/// A Graphviz that refuses every graph.
struct Refusing;

impl Graphviz for Refusing {
    fn render(&mut self, _graph: &str) -> Result<String, String> {
        Err("syntax error".to_owned())
    }
}

/// A board measured: two containers holding a card each, and a call from one
/// card to the other, drawn the way its nesting names.
fn two_containers(nesting: &str) -> String {
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
        "layoutOptions": { "archboard.blocks.nesting": nesting },
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
    for nesting in ["inline", "groups", "blocks"] {
        let mut graphviz = Column::default();
        let (answer, placed) =
            placed_of(&lay_out_board(&two_containers(nesting), &mut graphviz).unwrap()).unwrap();
        assert!(graphviz.asked > 0);
        let cards = placed["cards"].as_array().unwrap();
        let box_of = |id: &str| &cards.iter().find(|card| card["id"] == id).unwrap()["box"];
        let inside = |one: &Value, (width, height): (f64, f64)| {
            (number(&one["width"]), number(&one["height"])) == (width, height)
                && number(&one["x"]) + width <= number(&answer["width"])
                && number(&one["y"]) + height <= number(&answer["height"])
        };
        let [one, other] = [box_of("a"), box_of("b")];
        assert!(
            inside(one, (200.0, 80.0)) && inside(other, (160.0, 60.0)),
            "{nesting}"
        );
        let points = placed["edges"][0]["points"].as_array().unwrap();
        assert!(
            on_edge(&points[0], one) && on_edge(&points[points.len() - 1], other),
            "{nesting}"
        );
    }
}

#[test]
fn a_solve_fails_when_graphviz_refuses_its_graph() {
    lay_out_board(&two_containers("blocks"), &mut Refusing).unwrap_err();
}

#[test]
fn a_parent_inside_a_packed_group_stays_above_its_enclosing_inline_frame() {
    let graph = json!({
        "id": "root",
        "layoutOptions": {
            "archboard.blocks.nesting": "groups",
            "archboard.group.captions": "[[\"drawing\",80,20]]",
        },
        "children": [{
            "id": "outer", "width": 300, "height": 60,
            "layoutOptions": { "archboard.header.size": "60", "archboard.order": "5000" },
            "children": [{
                "id": "inner", "width": 300, "height": 60,
                "layoutOptions": {
                    "archboard.header.size": "60", "archboard.group": "drawing",
                    "archboard.order": "0",
                },
                "children": [{ "id": "leaf", "width": 200, "height": 80 }],
            }, {
                "id": "peer", "width": 200, "height": 80,
                "layoutOptions": { "archboard.group": "drawing" },
            }],
        }],
    });
    let (_, placed) =
        placed_of(&lay_out_board(&graph.to_string(), &mut Column::default()).unwrap()).unwrap();
    let frames = placed["frames"].as_array().unwrap();
    let depth = |id: &str| number(&frames.iter().find(|frame| frame["id"] == id).unwrap()["depth"]);
    assert!(
        depth("inner") > depth("outer"),
        "the outer frame must not hide the inner frame"
    );
    let regions = placed["regions"].as_array().unwrap();
    assert_eq!(regions[0]["parent"], "outer");
}

#[test]
fn a_group_member_ranks_its_sibling_containers_header_below_the_caller() {
    let graph = json!({
        "id": "root",
        "layoutOptions": {
            "archboard.blocks.nesting": "groups",
            "archboard.blocks.stacking": "false",
            "archboard.group.captions": "[[\"g\",80,20]]",
        },
        "children": [{
            "id": "source", "width": 200, "height": 80,
            "layoutOptions": { "archboard.group": "g" },
        }, {
            "id": "frame", "width": 300, "height": 60,
            "layoutOptions": { "archboard.group": "g", "archboard.header.size": "60" },
            "children": [{ "id": "target", "width": 200, "height": 80 }],
        }],
        "edges": [{ "id": "call", "sources": ["source"], "targets": ["target"] }],
    });
    let mut graphviz = Column::default();
    lay_out_board(&graph.to_string(), &mut graphviz).unwrap();
    assert!(
        graphviz
            .ranked
            .contains(&("source".to_owned(), "title:frame".to_owned()))
    );
}

#[test]
fn a_board_drawn_no_way_the_core_knows_is_refused_before_graphviz_is_asked() {
    let mut graphviz = Column::default();
    lay_out_board(&two_containers("stacked"), &mut graphviz).unwrap_err();
    assert_eq!(graphviz.asked, 0);
}
