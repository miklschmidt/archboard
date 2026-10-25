//! The layout's async solve contract: errors do not wait for other replies,
//! answers keep their meaning out of order, and dropping a layout drops its solves.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll, Waker};

use archboard_layout::{
    Calling, Content, Engine, Measured, MeasuredGroups, Solver, Unsolved, draw,
};
use archboard_scene::drawing::{MeasuredLabel, MeasuredNode, Painted};
use serde_json::{Value, json};

/// One solve held by the test host until it is answered explicitly.
struct Asked {
    graph: Value,
    answer: Option<Result<String, Unsolved>>,
    waker: Option<Waker>,
    dropped: bool,
}

/// A host whose replies are controlled without clocks or workers.
#[derive(Default)]
struct Host(RefCell<Vec<Asked>>);

/// A solve that records its cancellation through the Solver drop contract.
struct Solving<'a> {
    host: &'a Host,
    index: usize,
}

impl Future for Solving<'_> {
    type Output = Result<String, Unsolved>;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        let mut asked = self.host.0.borrow_mut();
        let held = &mut asked[self.index];
        held.waker = Some(context.waker().clone());
        held.answer.take().map_or(Poll::Pending, Poll::Ready)
    }
}

impl Drop for Solving<'_> {
    fn drop(&mut self) {
        self.host.0.borrow_mut()[self.index].dropped = true;
    }
}

impl Solver for Host {
    type Solve<'s> = Solving<'s>;

    fn solve(&self, graph: String, _: &Calling) -> Solving<'_> {
        let mut asked = self.0.borrow_mut();
        let index = asked.len();
        asked.push(Asked {
            graph: serde_json::from_str(&graph).expect("the core asks for a JSON graph"),
            answer: None,
            waker: None,
            dropped: false,
        });
        Solving { host: self, index }
    }
}

impl Host {
    /// Answer a solve and wake the layout that waits for it.
    fn answer(&self, index: usize, answer: Result<String, Unsolved>) {
        let mut asked = self.0.borrow_mut();
        asked[index].answer = Some(answer);
        if let Some(waker) = asked[index].waker.take() {
            waker.wake();
        }
    }

    /// A failure reaches the caller and releases every solve of the layout.
    fn fails(&self, answer: Poll<Result<Painted, String>>, words: &str) {
        assert_eq!(ready(answer).expect_err("the solve failed"), words);
        assert!(self.0.borrow().iter().all(|asked| asked.dropped));
    }
}

/// A card, optionally placed in a group so Track compares inline and packed solves.
fn board(grouped: bool) -> (Content, Measured) {
    let mut content: Content = serde_json::from_value(json!({
        "nodes": [{ "id": "card", "name": "Card", "kind": "service" }],
    }))
    .expect("the fixture is board content");
    let mut measured = Measured::default();
    measured.nodes.insert(
        "card".to_owned(),
        MeasuredNode {
            node: content.nodes[0].facts(),
            width: 100.0,
            height: 60.0,
            header_height: 0.0,
            runs: Vec::new(),
            headers: None,
            pointed: None,
        },
    );
    if grouped {
        let mut peer = content.nodes[0].clone();
        "peer".clone_into(&mut peer.id);
        let mut size = measured.nodes["card"].clone();
        size.node = peer.facts();
        measured.nodes.insert(peer.id.clone(), size);
        content.nodes.push(peer);
        measured.groups = Some(MeasuredGroups {
            placing: content
                .nodes
                .iter()
                .map(|node| (node.id.clone(), "group".to_owned()))
                .collect(),
            captions: std::iter::once((
                "group".to_owned(),
                MeasuredLabel {
                    width: 50.0,
                    height: 20.0,
                    runs: Vec::new(),
                    chips: Vec::new(),
                },
            ))
            .collect(),
        });
    }
    (content, measured)
}

/// The production choice, with no comparison or entry points.
async fn drawing(host: &Host, content: &Content, measured: &Measured) -> Result<Painted, String> {
    draw(
        content,
        measured,
        None,
        &BTreeMap::new(),
        Engine::Track,
        host,
    )
    .await
}

/// A full solve reply with no stackable block. Its width identifies the drawing.
fn answer(width: f64) -> String {
    json!({"layoutOptions": {
        "archboard.blocks.placed": json!({
            "width": width, "height": 60, "frames": [], "regions": [], "edges": [],
            "cards": [{"id": "card", "depth": 0, "box": {
                "x": 0, "y": 0, "width": width, "height": 60,
            }}],
        }).to_string(),
        "archboard.blocks.reading": json!({
            "parted": 0, "cost": 0, "crossings": 0, "length": 0,
            "weighed": {"width": width, "height": 60, "crossings": 0,
                "away": 0, "bends": 0, "length": 0},
        }).to_string(),
    }})
    .to_string()
}

/// Require the layout to answer without another host reply.
fn ready<T>(answer: Poll<T>) -> T {
    match answer {
        Poll::Ready(answer) => answer,
        Poll::Pending => panic!("the layout must answer on this poll"),
    }
}

#[test]
fn either_partial_solve_failure_returns_without_the_other_reply() {
    for failed in [0, 1] {
        let host = Host::default();
        let (content, measured) = board(false);
        let mut drawing = Box::pin(drawing(&host, &content, &measured));
        let mut context = Context::from_waker(Waker::noop());
        assert!(drawing.as_mut().poll(&mut context).is_pending());
        assert_eq!(host.0.borrow().len(), 2);
        host.answer(failed, Err(Unsolved::Failed("host failure".to_owned())));
        host.fails(drawing.as_mut().poll(&mut context), "host failure");
    }
}

#[test]
fn either_nesting_failure_returns_without_the_other_layout() {
    for nesting in ["inline", "groups"] {
        let host = Host::default();
        let (content, measured) = board(true);
        let mut drawing = Box::pin(drawing(&host, &content, &measured));
        let mut context = Context::from_waker(Waker::noop());
        assert!(drawing.as_mut().poll(&mut context).is_pending());
        assert_eq!(host.0.borrow().len(), 4);
        let failed: Vec<usize> = host
            .0
            .borrow()
            .iter()
            .enumerate()
            .filter(|(_, asked)| {
                asked.graph["layoutOptions"]["archboard.blocks.nesting"] == nesting
            })
            .map(|(index, _)| index)
            .collect();
        assert_eq!(failed.len(), 2);
        host.answer(
            failed[0],
            Err(Unsolved::Failed("nesting failure".to_owned())),
        );
        host.answer(failed[1], Ok(answer(100.0)));
        host.fails(drawing.as_mut().poll(&mut context), "nesting failure");
    }
}

#[test]
fn reversing_reply_order_keeps_the_chosen_drawing() {
    let widths = [200.0, 100.0];
    for order in [[0, 1], [1, 0]] {
        let host = Host::default();
        let (content, measured) = board(false);
        let mut drawing = Box::pin(drawing(&host, &content, &measured));
        let mut context = Context::from_waker(Waker::noop());
        assert!(drawing.as_mut().poll(&mut context).is_pending());
        host.answer(order[0], Ok(answer(widths[order[0]])));
        assert!(drawing.as_mut().poll(&mut context).is_pending());
        host.answer(order[1], Ok(answer(widths[order[1]])));
        let result = ready(drawing.as_mut().poll(&mut context));
        // Without a stackable block, the plain solve is kept in either reply order.
        assert_eq!(result.unwrap().drawing.cards[0].bounds.width, 100.0);
    }
}

#[test]
fn dropping_a_layout_cancels_its_solves_and_late_replies_do_not_answer_a_new_layout() {
    let host = Host::default();
    let (content, measured) = board(false);
    let mut first = Box::pin(drawing(&host, &content, &measured));
    let mut context = Context::from_waker(Waker::noop());
    assert!(first.as_mut().poll(&mut context).is_pending());
    drop(first);
    assert!(host.0.borrow().iter().all(|asked| asked.dropped));
    let mut next = Box::pin(drawing(&host, &content, &measured));
    assert!(next.as_mut().poll(&mut context).is_pending());
    host.answer(0, Ok(answer(200.0)));
    host.answer(1, Ok(answer(200.0)));
    assert!(next.as_mut().poll(&mut context).is_pending());
    host.answer(2, Ok(answer(100.0)));
    host.answer(3, Ok(answer(100.0)));
    let result = ready(next.as_mut().poll(&mut context));
    assert_eq!(result.unwrap().drawing.cards[0].bounds.width, 100.0);
}
