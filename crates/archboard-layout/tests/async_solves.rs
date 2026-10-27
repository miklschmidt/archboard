//! The one-solve contract: failures reach the caller, the reply determines
//! geometry, and dropping the layout cancels its pending solve.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll, Waker};

use archboard_layout::{Content, Engine, Measured, MeasuredGroups, Solver, Unsolved, draw};
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

    fn solve(&self, graph: String) -> Solving<'_> {
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

/// A card, optionally placed in a multi-member group that Track packs as a block.
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

/// Require the layout to wait for another host reply.
fn waits<F: Future>(layout: Pin<&mut F>) {
    assert!(
        layout
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending()
    );
}

/// Require the layout to answer without another host reply.
fn ready<T>(answer: Poll<T>) -> T {
    match answer {
        Poll::Ready(answer) => answer,
        Poll::Pending => panic!("the layout must answer on this poll"),
    }
}

/// A board whose one block could stack: a line from a card in one container
/// into a card in another.
fn stacking_board() -> (Content, Measured) {
    let content: Content = serde_json::from_value(json!({
        "nodes": [
            { "id": "left", "name": "Left", "kind": "service" },
            { "id": "out", "name": "Out", "kind": "service", "parent": "left" },
            { "id": "box", "name": "Box", "kind": "service" },
            { "id": "inner", "name": "Inner", "kind": "service", "parent": "box" },
        ],
        "edges": [{ "id": "line", "order": 1, "from": "out", "to": "inner", "kind": "call" }],
    }))
    .expect("the fixture is board content");
    let mut measured = Measured::default();
    for node in &content.nodes {
        measured.nodes.insert(
            node.id.clone(),
            MeasuredNode {
                node: node.facts(),
                width: 100.0,
                height: 60.0,
                header_height: if ["left", "box"].contains(&node.id.as_str()) {
                    30.0
                } else {
                    0.0
                },
                runs: Vec::new(),
                headers: None,
                pointed: None,
            },
        );
    }
    (content, measured)
}

/// A full reply for the graph with containers. Its width identifies the answer.
fn whole(width: f64) -> String {
    let cards = ["out", "inner"].map(|id| {
        json!({"id": id, "depth": 1,
        "box": {"x": 0, "y": 0, "width": width, "height": 60}})
    });
    let frames = ["left", "box"].map(|id| {
        json!({"id": id, "depth": 0,
        "box": {"x": 0, "y": 100, "width": width, "height": 100}})
    });
    json!({"layoutOptions": {"archboard.blocks.placed": json!({
        "width": width, "height": 200, "regions": [], "edges": [], "cards": cards, "frames": frames,
    }).to_string()}})
    .to_string()
}

#[test]
fn a_graph_with_containers_asks_one_whole_solve() {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut layout = Box::pin(drawing(&host, &content, &measured));
    waits(layout.as_mut());
    waits(layout.as_mut());
    assert_eq!(host.0.borrow().len(), 1);
    host.answer(0, Ok(whole(100.0)));
    let drawn = ready(
        layout
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
    )
    .expect("it draws");
    assert_eq!(drawn.drawing.cards[0].bounds.width, 100.0);
}

#[test]
fn nesting_is_fixed_before_the_only_solve() {
    for (grouped, nesting) in [(false, "inline"), (true, "groups")] {
        let host = Host::default();
        let (content, measured) = board(grouped);
        let mut layout = Box::pin(drawing(&host, &content, &measured));
        waits(layout.as_mut());
        let asked = host.0.borrow();
        assert_eq!(asked.len(), 1);
        assert_eq!(
            asked[0].graph["layoutOptions"]["archboard.blocks.nesting"],
            nesting
        );
        drop(asked);
        host.answer(0, Err(Unsolved::Failed("host failure".to_owned())));
        host.fails(
            layout
                .as_mut()
                .poll(&mut Context::from_waker(Waker::noop())),
            "host failure",
        );
    }
}

#[test]
fn a_solve_failure_reaches_the_caller_without_another_reply() {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut layout = Box::pin(drawing(&host, &content, &measured));
    waits(layout.as_mut());
    host.answer(0, Err(Unsolved::Failed("host failure".to_owned())));
    host.fails(
        layout
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
        "host failure",
    );
}

#[test]
fn independent_graphs_keep_their_answers_when_the_host_replies_in_reverse_order() {
    let host = Host::default();
    let (plain, plain_size) = board(false);
    let (contained, contained_size) = stacking_board();
    let mut first = Box::pin(drawing(&host, &plain, &plain_size));
    let mut second = Box::pin(drawing(&host, &contained, &contained_size));
    waits(first.as_mut());
    waits(second.as_mut());
    host.answer(1, Ok(whole(200.0)));
    let second = ready(
        second
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
    )
    .expect("second draws");
    waits(first.as_mut());
    host.answer(0, Ok(answer(100.0)));
    let first =
        ready(first.as_mut().poll(&mut Context::from_waker(Waker::noop()))).expect("first draws");
    assert_eq!(first.drawing.cards[0].bounds.width, 100.0);
    assert_eq!(second.drawing.cards[0].bounds.width, 200.0);
}

#[test]
fn dropping_a_layout_drops_its_solve_and_late_replies_do_not_answer_a_new_layout() {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut first = Box::pin(drawing(&host, &content, &measured));
    waits(first.as_mut());
    drop(first);
    assert!(host.0.borrow()[0].dropped);
    let (plain, sizes) = board(false);
    let mut next = Box::pin(drawing(&host, &plain, &sizes));
    waits(next.as_mut());
    host.answer(0, Ok(whole(200.0)));
    waits(next.as_mut());
    host.answer(1, Ok(answer(100.0)));
    let next =
        ready(next.as_mut().poll(&mut Context::from_waker(Waker::noop()))).expect("next draws");
    assert_eq!(next.drawing.cards[0].bounds.width, 100.0);
}
