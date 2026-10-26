//! A corpus board drawn by a native build of the core, to the same document
//! the WebAssembly build draws (ADR 0057).
//!
//! The fixture (`fixtures/recommendations.json`) holds what the WebAssembly core was
//! asked and answered: the request its host wrote, the icons it was given, and
//! the document it wrote. The native render lays out each solve here, Graphviz
//! included (ADR 0058), so a native build lays a board out with no C library
//! and no host's Graphviz.
//!
//! `packages/renderer/tests/runtime/support/capture-native-fixture.ts` writes
//! the fixture again after a change to what the core draws.

use std::collections::BTreeMap;
use std::fs;
use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use archboard_graphviz::InCore;
use archboard_layout::{Calling, InProcess, Laying, Solver};
use archboard_render::request::RenderRequest;
use archboard_render::{Host, Rendered, Renderer};
use serde::Deserialize;

/// What the WebAssembly core was asked and answered.
#[derive(Debug, Deserialize)]
struct Fixture {
    request: String,
    icons: BTreeMap<String, Vec<String>>,
    svg: String,
}

/// The Graphviz a solve lays its graphs out with: the core's own.
type InCoreFor = fn(&str) -> InCore;

/// Where the native render runs: its solves here, its icons the fixture's.
struct Native {
    solver: InProcess<InCoreFor>,
    icons: BTreeMap<String, Vec<String>>,
}

impl Native {
    fn new(icons: BTreeMap<String, Vec<String>>) -> Native {
        Native {
            solver: InProcess::new(|_| InCore),
            icons,
        }
    }
}

impl Solver for Native {
    type Solve<'s>
        = Laying<'s, InCoreFor>
    where
        Self: 's;

    fn solve(&self, graph: String, calling: &Calling) -> Self::Solve<'_> {
        self.solver.solve(graph, calling)
    }
}

impl Host for Native {
    fn icons(&self, names: &[&str]) -> Result<BTreeMap<String, Vec<String>>, String> {
        Ok(names
            .iter()
            .filter_map(|name| Some(((*name).to_owned(), self.icons.get(*name)?.clone())))
            .collect())
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
    let host = Native::new(fixture.icons);
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

#[test]
fn a_sequence_with_an_unknown_participant_is_refused_before_painting() {
    let request: RenderRequest = serde_json::from_str(
        r#"{"grammar":"sequence","content":{"flows":[
            {"id":"f","name":"F","participants":["missing"],"steps":[
                {"id":"s","kind":"self","from":"missing","to":"missing","label":"work"}]}]},
            "policy":{"levels":[],"nodeKinds":{},"relationshipKinds":{}},
            "clock":{"farViewSwapMs":100,"trafficSpeed":100,"cycleCapMs":1000}}"#,
    )
    .unwrap();
    let host = Native::new(BTreeMap::new());
    answer_of(Renderer::default().render(&request, &host))
        .expect_err("an incomplete reading must return an error, not panic in the painter");
}
