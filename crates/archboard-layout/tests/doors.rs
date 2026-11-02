//! A door keeps its measured size through ranking and port allocation on both engines.

use std::collections::BTreeMap;
use std::future::Future;
use std::task::{Context, Poll, Waker};

use archboard_layout::{Content, Engine, InProcess, Measured, draw};
use archboard_scene::drawing::{MeasuredNode, Painted};
use archboard_scene::geometry::{Point, Rect};
use serde_json::{Value, json};

/// Draw semantic content through the production graph builder and the real layout engine.
fn drawing(content: Value, sizes: &[(f64, f64)], engine: Engine) -> Painted {
    let content: Content = serde_json::from_value(content).expect("valid board content");
    let mut measured = Measured::default();
    for (node, &(width, height)) in content.nodes.iter().zip(sizes) {
        measured.nodes.insert(
            node.id.clone(),
            MeasuredNode {
                node: node.facts(),
                width,
                height,
                header_height: 0.0,
                runs: Vec::new(),
                headers: None,
                pointed: None,
                tags_under: None,
            },
        );
    }
    let host = InProcess::new(|_: &str| archboard_graphviz::InCore);
    let entries = BTreeMap::new();
    let mut drawing = std::pin::pin!(draw(&content, &measured, None, &entries, engine, &host));
    let Poll::Ready(answer) = drawing
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    else {
        panic!("an in-process solve answers immediately");
    };
    answer.expect("a drawing")
}

fn assert_door_size(drawn: &Painted, engine: Engine) {
    let door = drawn
        .drawing
        .cards
        .iter()
        .find(|card| card.measured.node.id == "door")
        .expect("the door is drawn");
    assert_eq!(door.bounds.width, door.measured.width, "{engine:?}");
    assert_eq!(door.bounds.height, door.measured.height, "{engine:?}");
    for line in &drawn.drawing.edges {
        let ends = [
            (&line.edge.from, line.curve.from),
            (&line.edge.to, line.curve.end()),
        ];
        for (_, point) in ends.into_iter().filter(|(id, _)| id.as_str() == "door") {
            assert!(
                on_edge(point, door.bounds),
                "{engine:?}: {} at {point:?}, {:?}",
                line.edge.id,
                door.bounds
            );
        }
    }
}

// Blocks puts contacts 0.02 units outside the face to survive SVG rounding.
fn on_edge(point: Point, at: Rect) -> bool {
    let (x, y) = (point.x - at.x, point.y - at.y);
    x >= -0.05
        && x <= at.width + 0.05
        && y >= -0.05
        && y <= at.height + 0.05
        && [x, y, x - at.width, y - at.height]
            .iter()
            .any(|gap| gap.abs() < 0.05)
}

#[test]
fn a_door_keeps_its_width_when_a_joined_card_is_slightly_wider() {
    for engine in [Engine::Track, Engine::Blocks] {
        let drawn = drawing(
            json!({
            "nodes":[{"id":"card","name":"Card","kind":"service"},
                {"id":"door","name":"Door","kind":"service","door":"across"}],
            "edges":[{"id":"line","from":"card","to":"door","kind":"calls","order":0}]}),
            &[(130.0, 100.0), (120.0, 34.0)],
            engine,
        );
        assert_door_size(&drawn, engine);
    }
}

#[test]
fn independent_ports_fit_the_door_instead_of_widening_it() {
    for engine in [Engine::Track, Engine::Blocks] {
        for incoming in [false, true] {
            let nodes: Vec<Value> = std::iter::once(json!({"id":"door","name":"Door",
                "kind":"service","door":"across"}))
            .chain((0..8).map(|i| json!({"id":format!("card{i}"),"name":"Card","kind":"service"})))
            .collect();
            let edges: Vec<Value> = (0..8).map(|i| {
                let (from, to) = if incoming {
                    (format!("card{i}"), "door".to_owned())
                } else {
                    ("door".to_owned(), format!("card{i}"))
                };
                json!({"id":format!("line{i}"),"from":from,"to":to,"order":i,"kind":format!("kind{i}")})
            }).collect();
            let mut sizes = vec![(200.0, 100.0); nodes.len()];
            sizes[0] = (120.0, 34.0);
            let drawn = drawing(json!({"nodes":nodes,"edges":edges}), &sizes, engine);
            assert_door_size(&drawn, engine);
            assert_eq!(drawn.drawing.edges.len(), 8);
        }
    }
}
