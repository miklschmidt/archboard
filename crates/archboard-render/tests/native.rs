//! A corpus board drawn by a native build of the core, to the same document
//! the WebAssembly build draws (ADR 0057).
//!
//! The fixture (`fixtures/recommendations.json`) holds what the WebAssembly core was
//! asked and answered: the request its host wrote, the icons it was given,
//! each solve it asked for with every graph that solve's Graphviz laid out and
//! what Graphviz answered, and the document it wrote. The native render runs
//! each solve here and answers its Graphviz from the fixture, in the order the
//! WebAssembly solve asked, after holding the graph it asks to the one the
//! WebAssembly solve asked. Graphviz is a C library the host runs, so its
//! answers are recorded rather than run: the test holds the core, not Graphviz.
//!
//! `packages/renderer/tests/runtime/support/capture-native-fixture.ts` writes
//! the fixture again after a change to what the core draws.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use archboard_layout::{Calling, Graphviz, InProcess, Laying, Solver};
use archboard_render::request::RenderRequest;
use archboard_render::{Host, Rendered, Renderer};
use serde::Deserialize;
use serde_json::Value;

/// One graph a solve's Graphviz laid out, and what it answered.
#[derive(Clone, Debug, Deserialize)]
struct Render {
    graph: Value,
    answer: String,
}

/// One solve the WebAssembly render asked for.
#[derive(Debug, Deserialize)]
struct Solve {
    graph: String,
    renders: Vec<Render>,
}

/// What the WebAssembly core was asked and answered.
#[derive(Debug, Deserialize)]
struct Fixture {
    request: String,
    icons: BTreeMap<String, Vec<String>>,
    solves: Vec<Solve>,
    svg: String,
}

/// A solve's Graphviz, answering from the fixture.
#[derive(Debug)]
struct Recorded {
    renders: std::vec::IntoIter<Render>,
}

impl Graphviz for Recorded {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        let render = self
            .renders
            .next()
            .ok_or("the WebAssembly solve asked Graphviz for fewer graphs")?;
        let asked: Value = serde_json::from_str(graph).map_err(|error| error.to_string())?;
        assert_eq!(
            asked, render.graph,
            "a solve asked Graphviz for another graph"
        );
        Ok(render.answer)
    }
}

/// The renders of each solve, by its graph.
type Renders = HashMap<String, Vec<Render>>;

/// Where the native render runs: its solves here, its icons the fixture's.
struct Native<F> {
    solver: InProcess<F>,
    icons: BTreeMap<String, Vec<String>>,
}

impl<F: Fn(&str) -> Recorded> Solver for Native<F> {
    type Solve<'s>
        = Laying<'s, F>
    where
        Self: 's;

    fn solve(&self, graph: String, calling: &Calling) -> Self::Solve<'_> {
        self.solver.solve(graph, calling)
    }
}

impl<F: Fn(&str) -> Recorded> Host for Native<F> {
    fn icons(&self, names: &[&str]) -> BTreeMap<String, Vec<String>> {
        names
            .iter()
            .filter_map(|name| Some(((*name).to_owned(), self.icons.get(*name)?.clone())))
            .collect()
    }
}

/// A future's answer: every solve here answers when it is first waited for.
fn answer_of<T>(future: impl Future<Output = T>) -> T {
    let mut future = pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(answer) => answer,
        Poll::Pending => panic!("a render here waits on nothing"),
    }
}

#[test]
fn a_native_build_draws_a_corpus_board_to_the_bytes_the_webassembly_build_draws() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/recommendations.json"
    );
    let fixture: Fixture =
        serde_json::from_str(&fs::read_to_string(path).expect("the fixture is there"))
            .expect("the fixture reads");
    let renders: Renders = fixture
        .solves
        .into_iter()
        .map(|solve| (solve.graph, solve.renders))
        .collect();
    let host = Native {
        solver: InProcess::new(|graph: &str| Recorded {
            renders: renders
                .get(graph)
                .expect("the WebAssembly render asked for this solve")
                .clone()
                .into_iter(),
        }),
        icons: fixture.icons,
    };
    let request: RenderRequest = serde_json::from_str(&fixture.request).expect("the request reads");
    let rendered = answer_of(Renderer::default().render(&request, &host)).expect("it draws");
    let Rendered::Drawn(drawn) = rendered else {
        panic!("the board drew nothing");
    };
    assert!(
        drawn.document.svg == fixture.svg,
        "the native document differs from the WebAssembly one"
    );
}
