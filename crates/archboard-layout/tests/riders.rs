//! Relationships between the same two parts reach the layout as one line, a cable, and each is
//! drawn as a strand beside its route.

use std::cell::RefCell;
use std::future::{Future, Ready, ready};
use std::task::{Context, Poll, Waker};

use archboard_layout::{Content, Engine, Measured, Solver, Unsolved, draw, lay_out_picture};
use archboard_scene::drawing::{MeasuredNode, Painted};
use serde_json::{Value, json};

/// Every solve laid out here, keeping each graph it was asked to lay out.
#[derive(Default)]
struct Here {
    graphs: RefCell<Vec<String>>,
}

impl Solver for Here {
    type Solve<'s> = Ready<Result<String, Unsolved>>;

    fn solve(&self, graph: String) -> Self::Solve<'_> {
        self.graphs.borrow_mut().push(graph.clone());
        ready(lay_out_picture(&graph, &mut archboard_graphviz::InCore).map_err(Unsolved::Failed))
    }
}

fn drawing(content: Value, solver: &Here) -> Painted {
    let content: Content = serde_json::from_value(content).expect("valid picture content");
    let mut measured = Measured::default();
    for node in &content.nodes {
        measured.nodes.insert(
            node.id.clone(),
            MeasuredNode {
                node: node.facts(),
                width: 200.0,
                height: 100.0,
                header_height: 0.0,
                runs: Vec::new(),
                headers: None,
            },
        );
    }
    let mut drawing = std::pin::pin!(draw(&content, &measured, None, Engine::Blocks, solver));
    let Poll::Ready(answer) = drawing
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    else {
        panic!("an in-process solve answers immediately");
    };
    answer.expect("a drawing")
}

/// Two parts with two relationships one way, a cable of two strands, and one the other way.
fn pair() -> Value {
    json!({
    "nodes":[{"id":"one","name":"One","kind":"service"},
        {"id":"other","name":"Other","kind":"service"}],
    "edges":[
        {"id":"sync","from":"one","to":"other","kind":"sync","order":0},
        {"id":"event","from":"one","to":"other","kind":"event","order":1},
        {"id":"back","from":"other","to":"one","kind":"sync","order":2}]})
}

/// The strands of a cable fan out where they reach a card: each end lands on the card's wall at
/// the same depth as the others, on a port of its own a lane from the next, so their marks stand
/// side by side.
#[test]
fn a_cables_strands_end_side_by_side_a_lane_apart() {
    let drawn = drawing(pair(), &Here::default());
    let curve = |id: &str| {
        (drawn.drawing.edges.iter())
            .find(|line| line.edge.id == id)
            .map(|line| line.curve.clone())
            .expect("each relationship is drawn")
    };
    let (sync, event) = (curve("sync"), curve("event"));
    for (one, other) in [(sync.from, event.from), (sync.end(), event.end())] {
        let (across, along) = ((one.x - other.x).abs(), (one.y - other.y).abs());
        let (apart, depth) = if across > along {
            (across, along)
        } else {
            (along, across)
        };
        assert!((apart - 16.0).abs() < 1e-6, "{one:?} {other:?}");
        assert!(depth < 1e-6, "{one:?} {other:?}");
    }
}

#[test]
fn relationships_between_two_parts_are_laid_out_as_one_line_and_drawn_as_its_strands() {
    let solver = Here::default();
    let drawn = drawing(pair(), &solver);
    for graph in solver.graphs.borrow().iter() {
        let graph: Value = serde_json::from_str(graph).expect("a graph");
        let ids: Vec<&str> = (graph["edges"].as_array().expect("edges").iter())
            .filter_map(|edge| edge["id"].as_str())
            .collect();
        assert_eq!(ids, ["sync", "back"]);
    }
    let curve = |id: &str| {
        (drawn.drawing.edges.iter())
            .find(|line| line.edge.id == id)
            .map(|line| line.curve.clone())
            .expect("each relationship is drawn")
    };
    // The two strands of the cable end a lane apart, each on its own port.
    let (sync, event) = (curve("sync"), curve("event"));
    for (one, other) in [(sync.from, event.from), (sync.end(), event.end())] {
        assert!(((one.x - other.x).hypot(one.y - other.y) - 16.0).abs() < 1e-6);
    }
    assert_ne!(curve("back"), sync);
}

#[test]
fn a_cables_line_names_each_strand_it_carries_and_a_lone_line_names_none() {
    let solver = Here::default();
    drawing(
        json!({
        "nodes":[{"id":"one","name":"One","kind":"service"},
            {"id":"other","name":"Other","kind":"service"},
            {"id":"hub","name":"Hub","kind":"service"}],
        "edges":[
            {"id":"sync","from":"one","to":"hub","kind":"sync","order":0},
            {"id":"event","from":"one","to":"hub","kind":"event","order":1},
            {"id":"plain","from":"other","to":"hub","kind":"sync","order":2}]}),
        &solver,
    );
    for graph in solver.graphs.borrow().iter() {
        let graph: Value = serde_json::from_str(graph).expect("a graph");
        let cable = |id: &str| {
            (graph["edges"].as_array().expect("edges").iter())
                .find(|edge| edge["id"] == id)
                .map(|edge| edge["layoutOptions"]["archboard.cable"].clone())
                .expect("the line is laid out")
        };
        let sync = cable("sync");
        let strands: Vec<&str> = sync.as_str().expect("a cable").split(';').collect();
        assert_eq!(strands.len(), 2);
        assert!(strands[0].starts_with("sync|") && strands[1].starts_with("event|"));
        assert!(cable("plain").is_null());
    }
}
