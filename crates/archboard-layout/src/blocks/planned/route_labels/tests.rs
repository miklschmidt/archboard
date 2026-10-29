use super::*;
use crate::{
    blocks::{
        assembly::{Placed, PlacedLine},
        planned::shape::ScopePlacement,
    },
    graph::Node,
};
use serde_json::json;

fn drawing(paths: &[(&str, &[(f64, f64)])]) -> Shape {
    let mut shape = Shape::new(Placed {
        width: 1000.0,
        height: 1000.0,
        cards: vec![],
        frames: vec![],
        regions: vec![],
        titles: vec![],
        edges: paths
            .iter()
            .map(|(id, points)| PlacedLine {
                id: (*id).to_owned(),
                label: None,
                points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
            })
            .collect(),
    });
    std::rc::Rc::make_mut(&mut shape.scopes).insert(
        0,
        ScopePlacement {
            bounds: Rect {
                x: 0.0,
                y: 0.0,
                width: 1000.0,
                height: 1000.0,
            },
        },
    );
    shape
}
fn graph() -> Node {
    serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60},
            {"id":"c","width":100,"height":60}],"edges":[
            {"id":"ab","sources":["a"],"targets":["b"],"labels":[{"width":80,"height":24}]},
            {"id":"ac","sources":["a"],"targets":["c"]}]}))
    .unwrap()
}
#[test]
fn stacked_labels_follow_a_vertical_run_even_when_the_horizontal_run_is_longer() {
    let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60}],
            "edges":[{"id":"ab","sources":["a"],"targets":["b"],
                "labels":[{"width":80,"height":180,"stacked":true}]}]}))
    .unwrap();
    let model = Model::new(&graph).unwrap();
    let shape = drawing(&[("ab", &[(100.0, 100.0), (900.0, 100.0), (900.0, 500.0)])]);
    let slots = Slots::new(&model, &shape);
    let (label, _) = slots.slot(&model, 0, &shape.routes[0].points).unwrap();
    assert_eq!(label.x + label.width / 2.0, 900.0);
    assert!(label.y > 100.0 && label.y + label.height < 500.0);
    assert!(
        slots
            .slot(&model, 0, &shape.routes[0].points[..2])
            .is_none()
    );
}

#[test]
fn words_use_the_longest_private_run_after_the_fan_splits() {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let shape = drawing(&[
        (
            "ab",
            &[
                (100.0, 100.0),
                (700.0, 100.0),
                (700.0, 400.0),
                (900.0, 400.0),
            ],
        ),
        (
            "ac",
            &[
                (100.0, 100.0),
                (700.0, 100.0),
                (700.0, 200.0),
                (500.0, 200.0),
            ],
        ),
    ]);
    let (label, fallback) = Slots::new(&model, &shape)
        .slot(&model, 0, &shape.routes[0].points)
        .unwrap();
    assert!(!fallback);
    assert_eq!(
        (label.x + label.width / 2.0, label.y + label.height / 2.0),
        (700.0, 300.0)
    );
}
#[test]
fn blocked_midpoints_use_the_nearest_clear_private_spot_without_rerouting() {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let shape = drawing(&[
        ("ab", &[(100.0, 500.0), (900.0, 500.0)]),
        ("ac", &[(500.0, 450.0), (500.0, 550.0)]),
    ]);
    let path = shape.routes[0].points.clone();
    let (label, fallback) = Slots::new(&model, &shape).slot(&model, 0, &path).unwrap();
    assert!(fallback);
    assert!((label.x - 116.01).abs() < 1e-6);
    assert_eq!(label.y, 488.0);
    assert_eq!(shape.routes[0].points, path);
}
