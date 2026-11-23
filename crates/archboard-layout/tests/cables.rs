//! A cable, the relationships between two parts drawn as one ribbon of strands, as Lanes lays
//! it out: its ports stand a lane clear of each other's ribbons, its ends keep room for their
//! marks, and two cables never share a port.

use archboard_layout::lay_out_picture;
use serde_json::{Value, json};

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
fn wide_fallback_cables_leave_their_card_a_lane_apart() {
    let targets = ["left", "centre", "right"];
    let children: Vec<_> = std::iter::once(json!({"id": "source", "width": 120, "height": 80}))
        .chain(targets.map(|id| json!({"id": id, "width": 200, "height": 80})))
        .collect();
    let edges = targets.map(|id| {
        json!({
            "id": id, "sources": ["source"], "targets": [id],
            "layoutOptions": {"archboard.cable": format!("{id};async;http;rpc;queue")}
        })
    });
    let graph = json!({
        "id": "root", "layoutOptions": {"archboard.layout.engine": "lanes"},
        "children": children, "edges": edges
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let card = placed["cards"]
        .as_array()
        .expect("the cards")
        .iter()
        .find(|card| card["id"] == "source")
        .expect("the source card");
    let mut ports: Vec<f64> = placed["edges"]
        .as_array()
        .expect("the lines")
        .iter()
        .map(|line| line["points"][0]["x"].as_f64().expect("a port"))
        .collect();
    ports.sort_by(f64::total_cmp);
    // Five strands span 32 units. A clear lane between the outer strands takes 16 more.
    assert!(
        ports.windows(2).all(|pair| pair[1] - pair[0] >= 48.0),
        "{ports:?}"
    );
    let left = card["box"]["x"].as_f64().expect("the left wall");
    let right = left + card["box"]["width"].as_f64().expect("the card's width");
    assert!(ports[0] - left >= 36.0);
    assert!(right - ports[2] >= 36.0);
}

#[test]
fn a_group_caption_leaves_the_full_width_of_each_lanes_ribbon() {
    let graph = json!({
        "id": "root",
        "layoutOptions": {
            "archboard.layout.engine": "lanes",
            "archboard.group.captions": "[[\"group\",100,20]]"
        },
        "children": [
            {"id": "left", "width": 200, "height": 80},
            {"id": "right", "width": 200, "height": 80},
            {"id": "target", "width": 200, "height": 80,
                "layoutOptions": {"archboard.group": "group"}}
        ],
        "edges": [
            {"id": "a", "sources": ["left"], "targets": ["target"],
                "layoutOptions": {"archboard.cable": "sync;event;rpc;http;queue"}},
            {"id": "b", "sources": ["right"], "targets": ["target"],
                "layoutOptions": {"archboard.cable": "sync;event;rpc;http;queue"}}
        ]
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let caption = &placed["regions"][0]["caption"];
    let caption_end = caption["x"].as_f64().expect("caption x")
        + caption["width"].as_f64().expect("caption width");
    let mut ports: Vec<_> = placed["edges"]
        .as_array()
        .expect("the lines")
        .iter()
        .map(|line| {
            let points = line["points"].as_array().expect("the route");
            points.last().expect("a head")["x"]
                .as_f64()
                .expect("port x")
        })
        .collect();
    ports.sort_by(f64::total_cmp);
    // Five strands fan out over 64 units at their card. The card widens past the caption until
    // both fans fit beside it, apart.
    assert!(ports[1] - ports[0] > 64.0, "{ports:?}");
    assert!(ports[0] - 32.0 >= caption_end, "{ports:?}");
}

#[test]
fn a_fallback_cable_leaves_room_for_its_marks_at_both_ends() {
    let graph = json!({
        "id": "root", "layoutOptions": {"archboard.layout.engine": "lanes"},
        "children": [
            {"id": "source", "width": 120, "height": 80},
            {"id": "left", "width": 200, "height": 80},
            {"id": "right", "width": 200, "height": 80}
        ],
        "edges": [
            {"id": "a", "sources": ["source"], "targets": ["left"],
                "layoutOptions": {"archboard.cable": "sync;async"}},
            {"id": "b", "sources": ["source"], "targets": ["right"],
                "layoutOptions": {"archboard.cable": "http;rpc"}}
        ]
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let minimum = archboard_scene::paint::design::approach_straight()
        + archboard_scene::geometry::bend_radius()
        + 4.0;
    let length = |one: &Value, two: &Value| {
        let coordinate = |point: &Value, axis: &str| point[axis].as_f64().expect("a coordinate");
        (coordinate(one, "x") - coordinate(two, "x")).abs()
            + (coordinate(one, "y") - coordinate(two, "y")).abs()
    };
    let mut bent = 0;
    for line in placed["edges"].as_array().expect("the lines") {
        let points = line["points"].as_array().expect("the route");
        if let [first, second, _, ..] = points.as_slice() {
            bent += 1;
            assert!(length(first, second) >= minimum, "{line}");
            assert!(
                length(&points[points.len() - 2], &points[points.len() - 1]) >= minimum,
                "{line}"
            );
        }
    }
    assert!(bent > 0);
}

#[test]
fn a_lanes_cable_keeps_its_face_port_when_it_could_enter_by_a_frame_wall() {
    let graph = json!({
        "id": "root",
        "layoutOptions": {"archboard.layout.engine": "lanes"},
        "children": [
            {"id": "frame", "width": 175, "height": 36,
                "layoutOptions": {"archboard.header.size": "36", "archboard.order": "2"},
                "children": [{"id": "target", "width": 60, "height": 130}]},
            {"id": "source", "width": 40, "height": 150,
                "layoutOptions": {"archboard.order": "10"}},
            {"id": "anchor", "width": 300, "height": 100}
        ],
        "edges": [{"id": "cable", "sources": ["source"], "targets": ["target"],
            "layoutOptions": {"archboard.cable": "sync;event"}}]
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let card = &placed["cards"]
        .as_array()
        .expect("the cards")
        .iter()
        .find(|card| card["id"] == "target")
        .expect("the target card")["box"];
    let points = placed["edges"][0]["points"].as_array().expect("the route");
    let head = points.last().expect("a head");
    assert_eq!(head["y"], card["y"]);
    assert_eq!(head["x"], points[points.len() - 2]["x"]);
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
