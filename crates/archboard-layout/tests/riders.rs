//! Relationships between the same two parts reach the layout as one line, and each is drawn
//! along it.

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

#[test]
fn relationships_between_two_parts_are_laid_out_as_one_line_and_drawn_along_it() {
    let solver = Here::default();
    let drawn = drawing(
        json!({
        "nodes":[{"id":"one","name":"One","kind":"service"},
            {"id":"other","name":"Other","kind":"service"}],
        "edges":[
            {"id":"sync","from":"one","to":"other","kind":"sync","order":0},
            {"id":"event","from":"one","to":"other","kind":"event","order":1},
            {"id":"back","from":"other","to":"one","kind":"sync","order":2}]}),
        &solver,
    );
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
    assert_eq!(curve("event"), curve("sync"));
    assert_ne!(curve("back"), curve("sync"));
}
