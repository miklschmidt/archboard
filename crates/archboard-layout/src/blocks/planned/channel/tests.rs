use super::*;

#[test]
fn the_inner_strand_has_room_at_a_bend_where_the_fan_spreads() {
    let source = Rect {
        x: 60.0,
        y: 160.0,
        width: 80.0,
        height: 40.0,
    };
    let bounds = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let refusal = |across: f64| {
        let target = Rect {
            x: source.x + across,
            y: 70.0,
            ..source
        };
        let points = [
            Point { x: 100.0, y: 200.0 },
            Point { x: 100.0, y: 290.0 },
            Point {
                x: 100.0 + across,
                y: 290.0,
            },
            Point {
                x: 100.0 + across,
                y: 110.0,
            },
        ];
        basic((&points, (16.0, 32.0)), source, target, bounds)
    };
    assert_eq!(refusal(56.0), Some("approach"));
    assert_eq!(refusal(72.0), None);
}

#[test]
fn a_cable_keeps_its_fan_clear_of_a_nearby_card() {
    use crate::blocks::assembly::{Placed, PlacedCard};

    let graph = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": [{"id": "source"}, {"id": "target"}, {"id": "obstacle"}],
        "edges": [{
            "id": "cable", "sources": ["source"], "targets": ["target"],
            "layoutOptions": {"archboard.cable": "sync;async;http;rpc;queue"}
        }]
    }))
    .unwrap();
    let model = Model::new(&graph).unwrap();
    let topology = Topology::new(&model);
    let card = |id: &str, x, y, width| PlacedCard {
        id: id.to_owned(),
        bx: Rect {
            x,
            y,
            width,
            height: 80.0,
        },
        depth: 1,
        header: None,
    };
    let points = [
        Point { x: 90.0, y: 72.0 },
        Point { x: 290.0, y: 72.0 },
        Point { x: 290.0, y: 220.0 },
        Point { x: 390.0, y: 220.0 },
    ];
    let refusal = |obstacle_x| {
        let shape = super::super::fixed::placement(
            &model,
            Placed {
                width: 500.0,
                height: 300.0,
                cards: vec![
                    card("source", 10.0, 32.0, 80.0),
                    card("target", 390.0, 180.0, 80.0),
                    card("obstacle", obstacle_x, 106.0, 20.0),
                ],
                frames: vec![],
                regions: vec![],
                edges: vec![],
                titles: vec![],
                routed: None,
            },
        )
        .unwrap();
        Probe::new(&model, &topology, 0, &shape, shape.scopes[&0].bounds).refusal(&points)
    };
    assert_eq!(refusal(130.0), Some("card"));
    assert_eq!(refusal(220.0), None);
}

#[test]
fn a_cable_cannot_double_back_between_its_fan_and_body() {
    let card = |x, centre| Rect {
        x,
        y: centre - 40.0,
        width: 80.0,
        height: 80.0,
    };
    let refusal = |offset| {
        let points = [
            Point { x: 80.0, y: 70.0 },
            Point { x: 144.0, y: 70.0 },
            Point {
                x: 144.0,
                y: 70.0 + offset,
            },
            Point {
                x: 294.0,
                y: 70.0 + offset,
            },
        ];
        basic(
            (&points, (16.0, 32.0)),
            card(0.0, 70.0),
            card(294.0, 70.0 + offset),
            Rect {
                x: 0.0,
                y: 0.0,
                width: 400.0,
                height: 200.0,
            },
        )
    };
    assert_eq!(refusal(8.0), Some("approach"));
    assert_eq!(refusal(24.0), None);
}

#[test]
fn a_lone_line_cannot_take_a_detour_around_the_page() {
    let card = |x| Rect {
        x,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    };
    let source = card(0.0);
    let target = card(200.0);
    let bounds = Rect {
        width: 400.0,
        height: 600.0,
        ..source
    };
    let points = [
        Point { x: 50.0, y: 100.0 },
        Point { x: 50.0, y: 500.0 },
        Point { x: 250.0, y: 500.0 },
        Point { x: 250.0, y: 100.0 },
    ];
    assert_eq!(
        basic((&points, (0.0, 0.0)), source, target, bounds),
        Some("detour")
    );
}
