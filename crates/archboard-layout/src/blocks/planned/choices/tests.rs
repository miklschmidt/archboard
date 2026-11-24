use super::*;
use crate::{
    blocks::assembly::{Placed, PlacedCard},
    graph::Node,
};

/// Eight routes from the source's right wall share their longest run, so its family is
/// full. A route along that run from the source's bottom wall still keeps a place, because
/// the right wall's ports can all fail together while the router places other lines.
#[test]
fn a_route_from_another_wall_keeps_its_place_beside_a_full_family() {
    let graph: Node = serde_json::from_value(serde_json::json!({"id": "root",
        "children": [{"id": "a", "width": 160, "height": 80},
            {"id": "b", "width": 200, "height": 80}],
        "edges": [{"id": "ab", "sources": ["a"], "targets": ["b"]}]}))
    .expect("a node");
    let card = |id: &str, x: f64, y: f64| PlacedCard {
        id: id.into(),
        bx: Rect {
            x,
            y,
            width: if id == "a" { 160.0 } else { 200.0 },
            height: 80.0,
        },
        depth: 0,
        header: None,
    };
    let drawing = Placed {
        width: 1200.0,
        height: 700.0,
        cards: vec![card("a", 100.0, 100.0), card("b", 900.0, 400.0)],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: Vec::new(),
        titles: Vec::new(),
        routed: None,
    };
    let model = Model::new(&graph).expect("a model");
    let topology = Topology::new(&model);
    let shape = super::super::fixed::placement(&model, drawing).expect("a shape");
    let bounds = shape.scopes[&topology.routes[0].scope].bounds;
    let probe = super::super::channel::Probe::new(&model, &topology, 0, &shape, bounds);
    let path = |points: &[(f64, f64)]| -> Vec<Point> {
        points.iter().map(|&(x, y)| Point { x, y }).collect()
    };
    let mut pool = Pool::default();
    let mut keep = |points: Vec<Point>| {
        (probe.refusal(&points).is_none())
            .then(|| pool.keep(&model, 0, &points, None))
            .flatten()
    };
    for at in 0..8 {
        let y = 108.0 + 8.0 * f64::from(at);
        let right = path(&[(260.0, y), (300.0, y), (300.0, 440.0), (900.0, 440.0)]);
        assert!(
            keep(right).is_some(),
            "the right wall's route {at} has no place"
        );
    }
    let bottom = path(&[(180.0, 180.0), (180.0, 440.0), (900.0, 440.0)]);
    assert!(keep(bottom).is_some());
}

#[test]
fn a_straight_route_can_use_either_end_of_a_span_with_blocked_centres() {
    let graph: Node = serde_json::from_value(serde_json::json!({"id": "root",
        "children": [{"id": "source"}, {"id": "target"}, {"id": "obstacle"}],
        "edges": [{"id": "line", "sources": ["source"], "targets": ["target"]}]}))
    .unwrap();
    let model = Model::new(&graph).unwrap();
    let topology = Topology::new(&model);
    let card = |id: &str, x, y, width, height| PlacedCard {
        id: id.into(),
        bx: Rect {
            x,
            y,
            width,
            height,
        },
        depth: 0,
        header: None,
    };
    let drawing = Placed {
        width: 400.0,
        height: 550.0,
        cards: vec![
            card("source", 100.0, 100.0, 120.0, 34.0),
            card("target", 100.0, 380.0, 120.0, 34.0),
            card("obstacle", 148.0, 150.0, 24.0, 214.0),
        ],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: Vec::new(),
        titles: Vec::new(),
        routed: None,
    };
    let shape = super::super::fixed::placement(&model, drawing).unwrap();
    let routes = choose(&model, &topology, 0, &shape, None, None, Search::Simple);
    for x in [120.0, 200.0] {
        assert!(
            routes
                .iter()
                .any(|line| line.points.len() == 2 && line.points.iter().all(|point| point.x == x)),
            "no straight route at {x}"
        );
    }
}

#[test]
fn a_straight_cable_needs_room_for_its_marks_but_no_bend_approach() {
    let graph: Node = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": [{"id": "source"}, {"id": "target"}, {"id": "obstacle"}],
        "edges": [{"id": "cable", "sources": ["source"], "targets": ["target"],
            "layoutOptions": {"archboard.cable": "sync;async;http;rpc;queue"}}]
    }))
    .unwrap();
    let model = Model::new(&graph).unwrap();
    let topology = Topology::new(&model);
    let card = |id: &str, x, y, width, height| PlacedCard {
        id: id.into(),
        bx: Rect {
            x,
            y,
            width,
            height,
        },
        depth: 0,
        header: None,
    };
    let drawing = Placed {
        width: 400.0,
        height: 400.0,
        cards: vec![
            card("source", 100.0, 100.0, 200.0, 34.0),
            card("target", 100.0, 206.0, 200.0, 34.0),
            card("obstacle", 201.0, 160.0, 24.0, 24.0),
        ],
        frames: Vec::new(),
        regions: Vec::new(),
        edges: Vec::new(),
        titles: Vec::new(),
        routed: None,
    };
    let shape = super::super::fixed::placement(&model, drawing).unwrap();
    let routes = choose(&model, &topology, 0, &shape, None, None, Search::Simple);
    // The first straight span clear of the obstacle stands the cable's fan clear of the
    // target's corner: 100 + 20 + 32.
    assert!(routes.iter().any(|line| {
        line.points.len() == 2
            && line.points.iter().all(|point| point.x == 152.0)
            && (length(&line.points) - 72.0).abs() < 0.1
    }));
}
