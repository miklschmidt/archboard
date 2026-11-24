use super::{channel::Probe, fixed, model::Model, topology::Topology};
use crate::{
    blocks::assembly::{Placed, PlacedArea, PlacedCard},
    geometry::{Point, Rect},
};

#[test]
fn a_fan_enters_a_scope_through_one_wall() {
    let graph = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": [
            {"id": "source"},
            {"id": "target", "layoutOptions": {"archboard.group": "g"}}
        ],
        "edges": [{
            "id": "cable", "sources": ["source"], "targets": ["target"],
            "layoutOptions": {"archboard.cable": "sync;async;http;rpc;queue;event"}
        }]
    }))
    .unwrap();
    let model = Model::new(&graph).unwrap();
    let topology = Topology::new(&model);
    let rect = |x, y, width, height| Rect {
        x,
        y,
        width,
        height,
    };
    let card = |id: &str, x, y| PlacedCard {
        id: id.to_owned(),
        bx: rect(x, y, 100.0, 80.0),
        depth: 1,
        header: None,
    };
    let points = [
        Point { x: 150.0, y: 90.0 },
        Point { x: 150.0, y: 205.0 },
        Point { x: 350.0, y: 205.0 },
        Point { x: 350.0, y: 295.0 },
    ];
    let refusal = |left| {
        let shape = fixed::placement(
            &model,
            Placed {
                width: 500.0,
                height: 450.0,
                cards: vec![card("source", 100.0, 10.0), card("target", 300.0, 295.0)],
                frames: vec![],
                regions: vec![PlacedArea {
                    group: "g".into(),
                    parent: None,
                    bx: rect(left, 143.0, 450.0 - left, 272.0),
                    caption: rect(420.0, 145.0, 12.0, 4.0),
                    depth: 1,
                }],
                edges: vec![],
                titles: vec![],
                routed: None,
            },
        )
        .unwrap();
        Probe::new(&model, &topology, 0, &shape, shape.scopes[&0].bounds).refusal(&points)
    };
    // At x=112 the outermost strand is outside the scope at its top wall.
    assert_eq!(refusal(112.0), Some("wall lane"));
    assert_eq!(refusal(90.0), None);
}
