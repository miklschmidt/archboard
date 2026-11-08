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
        routed: None,
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

#[test]
fn words_never_stand_across_another_stretch_of_their_own_line() {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let route: &[(f64, f64)] = &[
        (100.0, 100.0),
        (100.0, 900.0),
        (140.0, 900.0),
        (140.0, 300.0),
    ];
    let shape = drawing(&[("ab", route)]);
    let path: Vec<Point> = route.iter().map(|&(x, y)| Point { x, y }).collect();
    let edge = model.edge_index["ab"];
    let (label, _) = Slots::new(&model, &shape)
        .slot(&model, edge, &path)
        .expect("words have a place on the line");
    // Both legs run side by side below 300, closer than the words are wide.
    assert!(label.y + label.height < 300.0);
}

/// Where a line's words stand, if anywhere, and whether that is a fallback.
type Found = Option<(Rect, bool)>;

/// A hairpin whose legs stand some way apart, and where its words stand clear of its other
/// stretches, then where they stand at all.
fn hairpin_slots(apart: f64) -> (Found, Found) {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let route: &[(f64, f64)] = &[
        (100.0, 100.0),
        (100.0, 300.0),
        (100.0 + apart, 300.0),
        (100.0 + apart, 100.0),
    ];
    let shape = drawing(&[("ab", route)]);
    let path: Vec<Point> = route.iter().map(|&(x, y)| Point { x, y }).collect();
    let edge = model.edge_index["ab"];
    let slots = Slots::new(&model, &shape);
    (
        slots.slot(&model, edge, &path),
        slots.any_slot(&model, edge, &path),
    )
}

#[test]
fn a_route_that_leaves_its_words_no_clear_spot_still_carries_them_beside_its_other_stretches() {
    // Words 80 wide on one leg stand 10 from the other: nearer than they keep from a line.
    let (clear, beside) = hairpin_slots(50.0);
    assert!(clear.is_none());
    let (label, fallback) = beside.expect("a line keeps its words");
    assert!(fallback);
    // They ride one leg and stop short of the other.
    let middle = label.x + label.width / 2.0;
    assert!(middle == 100.0 && label.x + label.width < 150.0 || middle == 150.0 && label.x > 100.0);
}

#[test]
fn words_never_stand_over_another_stretch_of_their_own_line() {
    // Words 80 wide on one leg would reach the other.
    assert_eq!(hairpin_slots(40.0), (None, None));
}

#[test]
fn words_that_stand_over_another_stretch_of_their_own_line_are_not_kept() {
    let route: &[(f64, f64)] = &[
        (100.0, 100.0),
        (100.0, 300.0),
        (140.0, 300.0),
        (140.0, 100.0),
    ];
    let path: Vec<Point> = route.iter().map(|&(x, y)| Point { x, y }).collect();
    let own = Own::new(0, &path);
    let words = |x| Rect {
        x,
        y: 188.0,
        width: 80.0,
        height: 24.0,
    };
    assert!(!own.rides_one(words(60.0)));
    assert!(own.rides_one(words(-30.0)));
}

#[test]
fn a_trunk_line_with_no_spot_off_its_own_line_waits_for_room() {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let route: &[(f64, f64)] = &[
        (100.0, 100.0),
        (100.0, 300.0),
        (140.0, 300.0),
        (140.0, 100.0),
    ];
    let mut shape = drawing(&[("ab", route)]);
    let edge = model.edge_index["ab"];
    assert_eq!(seat(&model, &mut shape, &[edge]), vec![edge]);
}

#[test]
fn a_drawing_knows_when_words_stand_on_their_own_line() {
    let graph = graph();
    let model = Model::new(&graph).unwrap();
    let route: &[(f64, f64)] = &[
        (100.0, 100.0),
        (100.0, 300.0),
        (140.0, 300.0),
        (140.0, 100.0),
    ];
    let mut shape = drawing(&[("ab", route)]);
    let edge = model.edge_index["ab"];
    let words = |x| Rect {
        x,
        y: 188.0,
        width: 80.0,
        height: 24.0,
    };
    shape.labels.insert(edge, words(-30.0));
    assert!(own::words_clear(&model, &shape));
    shape.labels.insert(edge, words(60.0));
    assert!(!own::words_clear(&model, &shape));
}

#[test]
fn words_too_wide_for_their_route_take_their_narrow_plate() {
    let graph = |narrow: serde_json::Value| -> Node {
        serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60}],"edges":[
            {"id":"ab","sources":["a"],"targets":["b"],
             "labels":[{"width":190,"height":31,"narrow":narrow}]}]}))
        .unwrap()
    };
    let route: &[(f64, f64)] = &[(100.0, 500.0), (280.0, 500.0)];
    let wide = graph(serde_json::Value::Null);
    let mut shape = drawing(&[("ab", route)]);
    assert_eq!(arrange(&Model::new(&wide).unwrap(), &mut shape), None);
    let both = graph(json!({"width":106,"height":46}));
    let mut shape = drawing(&[("ab", route)]);
    arrange(&Model::new(&both).unwrap(), &mut shape).expect("the narrow plate fits");
    let plate = shape.labels[&0];
    assert_eq!((plate.width, plate.height), (106.0, 46.0));
}
