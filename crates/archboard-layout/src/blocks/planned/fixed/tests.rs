use super::*;
use crate::blocks::assembly::PlacedCard;
use serde_json::json;

#[test]
fn the_final_guard_keeps_distinct_ports_a_lane_apart_on_one_wall() {
    for (door, kind, cable, gap) in [
        ("across", "event", None, 16.0),
        ("across", "http", None, 16.0),
        ("", "event", Some("left;strand"), 24.0),
    ] {
        check_port_gap(door, kind, cable, gap);
    }
}

fn check_port_gap(door: &str, kind: &str, cable: Option<&str>, gap: f64) {
    let door_options = if door.is_empty() {
        json!({})
    } else {
        json!({"archboard.door":door})
    };
    let mut left_options = json!({"archboard.relationship.kind":"http"});
    if let Some(cable) = cable {
        left_options["archboard.cable"] = json!(cable);
    }
    let graph: Node = serde_json::from_value(json!({"id":"root","children":[
        {"id":"door","layoutOptions":door_options},
        {"id":"left"}, {"id":"right"}],
        "edges":[{"id":"left","sources":["door"],"targets":["left"],
            "layoutOptions":left_options},
            {"id":"right","sources":["door"],"targets":["right"],
            "layoutOptions":{"archboard.relationship.kind":kind}}]}))
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
        width: 550.0,
        height: 400.0,
        cards: vec![
            card("door", 180.0, 80.0, 140.0, 34.0),
            card("left", 40.0, 180.0, 140.0, 80.0),
            card("right", 320.0, 180.0, 140.0, 80.0),
        ],
        frames: vec![],
        regions: vec![],
        edges: vec![],
        titles: vec![],
        routed: None,
    };
    let route = |id: &str, x, far| PlacedLine {
        id: id.into(),
        points: vec![
            Point { x, y: 114.02 },
            Point { x, y: 220.0 },
            Point { x: far, y: 220.0 },
        ],
        label: None,
    };
    let mut shape = placement(&model, drawing).unwrap();
    let routes = |separation| {
        vec![
            route("left", 250.0 - separation / 2.0, 180.02),
            route("right", 250.0 + separation / 2.0, 319.98),
        ]
    };
    shape.routes = routes(gap - 2.0);
    finish(&model, &topology, &mut shape).expect_err("the ports leave less than a lane");
    shape.routes = routes(gap);
    finish(&model, &topology, &mut shape).expect("the outer strands leave a full lane");
}

#[test]
fn opposite_wall_ports_keep_distinct_routes_off_one_line() {
    let graph: Node = serde_json::from_value(json!({"id":"root","children":[
        {"id":"a","width":160,"height":80},
        {"id":"b","width":160,"height":80},
        {"id":"c","width":160,"height":80}],
        "edges":[{"id":"ab","sources":["b"],"targets":["a"]},
            {"id":"bc","sources":["b"],"targets":["c"]}]}))
    .unwrap();
    let drawing = Placed {
        width: 1000.0,
        height: 400.0,
        cards: ["a", "b", "c"]
            .into_iter()
            .enumerate()
            .map(|(i, id)| PlacedCard {
                id: id.into(),
                bx: Rect {
                    x: 100.0 + i as f64 * 300.0,
                    y: 100.0,
                    width: 160.0,
                    height: 80.0,
                },
                depth: 0,
                header: None,
            })
            .collect(),
        frames: vec![],
        regions: vec![],
        edges: vec![],
        titles: vec![],
        routed: None,
    };
    let result = route(&graph, drawing, &super::super::selection::ORDERS).unwrap();
    let left = &result.edges.iter().find(|e| e.id == "ab").unwrap().points;
    let right = &result.edges.iter().find(|e| e.id == "bc").unwrap().points;
    assert_eq!(left.len(), 2);
    assert_eq!(right.len(), 2);
    assert!((left[0].y - right[0].y).abs() >= 16.0);
    // Empty bands contract while the measured cards and their ports stay intact.
    assert!(result.width < 1000.0 && result.height < 400.0);
    assert!(
        result
            .cards
            .iter()
            .all(|card| card.bx.width == 160.0 && card.bx.height == 80.0)
    );
}

#[test]
fn a_cable_leaving_a_frame_shoulder_emits_the_route_its_fan_was_guarded_on() {
    let graph = serde_json::from_value(json!({
        "id": "root", "children": [
            {"id": "frame", "children": [{"id": "child"}]},
            {"id": "target"}
        ],
        "edges": [{"id": "cable", "sources": ["frame"], "targets": ["target"],
            "layoutOptions": {"archboard.cable": "sync;event;rpc"}}]
    }))
    .expect("a measured graph");
    let model = Model::new(&graph).expect("known endpoints");
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
    let tab = card("tab", 20.0, 200.0, 100.0, 36.0).bx;
    let points = [
        Point { x: 160.0, y: 200.0 },
        Point { x: 160.0, y: 135.0 },
        Point { x: 166.0, y: 135.0 },
        Point { x: 166.0, y: 70.0 },
    ];
    let drawing = Placed {
        width: 400.0,
        height: 400.0,
        cards: vec![
            card("child", 54.0, 265.0, 80.0, 50.0),
            card("target", 110.0, 20.0, 120.0, 50.0),
        ],
        frames: vec![card("frame", 20.0, 200.0, 300.0, 140.0)],
        regions: vec![],
        edges: vec![PlacedLine {
            id: "cable".into(),
            points: points.to_vec(),
            label: None,
        }],
        titles: vec![crate::blocks::assembly::Title { bx: tab, band: tab }],
        routed: None,
    };
    let mut shape = placement(&model, drawing).expect("placed frame and cards");
    let result = finish(&model, &topology, &mut shape).expect("the short middle run fits");
    assert_eq!(result.edges[0].points, points);
}
