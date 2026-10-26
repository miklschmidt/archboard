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

/// A partial solve's reply: what its first block that could stack stood at.
fn stood() -> String {
    let scored = json!({ "score": 0.5, "fit": 0.5 });
    let stood = json!({
        "tied": scored,
        "settled": {
            "score": 0.5, "fit": 0.5, "length": 100,
            "weighed": { "width": 100, "height": 60, "crossings": 0 },
        },
    });
    json!({"layoutOptions": { "archboard.blocks.stood": stood.to_string() }}).to_string()
}

/// A whole solve's reply on the stacking board, which tells what its block stood at.
fn whole(width: f64) -> String {
    let mut reply: Value = serde_json::from_str(&answer(width)).expect("an answer");
    let cards = ["out", "inner"].map(
        |id| json!({"id": id, "depth": 0, "box": {"x": 0, "y": 0, "width": width, "height": 60}}),
    );
    let frames = ["left", "box"].map(|id| {
        json!({"id": id, "depth": 0, "box": {"x": 0, "y": 100, "width": width, "height": 100}})
    });
    let placed = json!({
        "width": width, "height": 200, "regions": [], "edges": [],
        "cards": cards,
        "frames": frames,
    });
    let stood: Value = serde_json::from_str(&stood()).expect("a stood reply");
    reply["layoutOptions"]["archboard.blocks.placed"] = Value::String(placed.to_string());
    reply["layoutOptions"]["archboard.blocks.stood"] =
        stood["layoutOptions"]["archboard.blocks.stood"].clone();
    reply.to_string()
}

/// The solves asked so far that name a stacking, partial first, by whether they stack.
fn stacking_solves(host: &Host) -> Vec<(usize, bool, bool)> {
    host.0
        .borrow()
        .iter()
        .enumerate()
        .filter_map(|(index, asked)| {
            let options = &asked.graph["layoutOptions"];
            let stacked = options["archboard.blocks.stacking"].as_str()? == "true";
            let partial = options["archboard.blocks.until-stood"] == "true";
            Some((index, partial, stacked))
        })
        .collect()
}

#[test]
fn a_board_that_could_stack_asks_both_whole_solves_beside_its_partial_ones() {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut drawing = Box::pin(drawing(&host, &content, &measured));
    let mut context = Context::from_waker(Waker::noop());
    assert!(drawing.as_mut().poll(&mut context).is_pending());
    // The whole solves are asked once every solve the render is sure to need is.
    assert!(drawing.as_mut().poll(&mut context).is_pending());
    let asked = stacking_solves(&host);
    assert_eq!(
        asked
            .iter()
            .map(|&(_, partial, stacked)| (partial, stacked))
            .collect::<Vec<_>>(),
        [(true, true), (true, false), (false, true), (false, false)]
    );
}

#[test]
fn a_board_that_cannot_stack_asks_one_solve() {
    let host = Host::default();
    let (content, measured) = board(false);
    let mut drawing = Box::pin(drawing(&host, &content, &measured));
    let mut context = Context::from_waker(Waker::noop());
    assert!(drawing.as_mut().poll(&mut context).is_pending());
    assert_eq!(host.0.borrow().len(), 1);
    host.answer(0, Ok(answer(100.0)));
    let result = ready(drawing.as_mut().poll(&mut context));
    assert_eq!(result.unwrap().drawing.cards[0].bounds.width, 100.0);
}

#[test]
fn either_partial_solve_failure_returns_without_the_other_reply() {
    for failed in [0, 1] {
        let host = Host::default();
        let (content, measured) = stacking_board();
        let mut drawing = Box::pin(drawing(&host, &content, &measured));
        let mut context = Context::from_waker(Waker::noop());
        assert!(drawing.as_mut().poll(&mut context).is_pending());
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
        let failed = host
            .0
            .borrow()
            .iter()
            .position(|asked| asked.graph["layoutOptions"]["archboard.blocks.nesting"] == nesting)
            .expect("a solve of the nesting");
        host.answer(failed, Err(Unsolved::Failed("nesting failure".to_owned())));
        host.fails(drawing.as_mut().poll(&mut context), "nesting failure");
    }
}

#[test]
fn a_large_grouped_graph_asks_only_for_packed_solves_and_propagates_failure() {
    let host = Host::default();
    let (mut content, mut measured) = board(true);
    let placing = &mut measured.groups.as_mut().unwrap().placing;
    for index in 0..40 {
        let mut card = content.nodes[0].clone();
        card.id = format!("card-{index}");
        let mut size = measured.nodes["card"].clone();
        size.node = card.facts();
        measured.nodes.insert(card.id.clone(), size);
        placing.insert(card.id.clone(), "group".to_owned());
        content.nodes.push(card);
    }
    let mut drawing = Box::pin(drawing(&host, &content, &measured));
    let mut context = Context::from_waker(Waker::noop());
    assert!(drawing.as_mut().poll(&mut context).is_pending());
    let asked = host.0.borrow();
    assert_eq!(asked.len(), 1);
    let way = &asked[0].graph["layoutOptions"];
    assert_eq!(way["archboard.blocks.nesting"], "groups");
    drop(asked);
    host.answer(0, Err(Unsolved::Failed("nesting failure".to_owned())));
    host.fails(drawing.as_mut().poll(&mut context), "nesting failure");
}

/// Lay the stacking board out, its whole solves answering first in one
/// order and its partial solves after them in the same order; answers the
/// width drawn and whether the whole solve laid stacked was dropped.
fn replied_in(order: [usize; 2]) -> (f64, bool) {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut drawing = Box::pin(drawing(&host, &content, &measured));
    waits(drawing.as_mut());
    waits(drawing.as_mut());
    let asked = stacking_solves(&host);
    let partials: Vec<usize> = asked.iter().filter(|one| one.1).map(|one| one.0).collect();
    let wholes: Vec<(usize, bool)> = asked
        .iter()
        .filter(|one| !one.1)
        .map(|one| (one.0, one.2))
        .collect();
    for &at in &order {
        let (index, stacked) = wholes[at];
        host.answer(index, Ok(whole(if stacked { 200.0 } else { 100.0 })));
    }
    waits(drawing.as_mut());
    host.answer(partials[order[0]], Ok(stood()));
    waits(drawing.as_mut());
    host.answer(partials[order[1]], Ok(stood()));
    let drawn = ready(
        drawing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop())),
    )
    .expect("it draws");
    let stacked_whole = wholes.iter().find(|one| one.1).expect("a stacked whole").0;
    let dropped = host.0.borrow()[stacked_whole].dropped;
    (drawn.drawing.cards[0].bounds.width, dropped)
}

#[test]
fn reversing_reply_order_keeps_the_chosen_drawing() {
    // Stood alike, the block is not stacked, so the whole solve laid plain is
    // kept, and the one laid stacked is called off, whichever answers first.
    for order in [[0, 1], [1, 0]] {
        assert_eq!(replied_in(order), (100.0, true));
    }
}

#[test]
fn dropping_a_layout_cancels_its_solves_and_late_replies_do_not_answer_a_new_layout() {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut first = Box::pin(drawing(&host, &content, &measured));
    waits(first.as_mut());
    waits(first.as_mut());
    drop(first);
    assert!(host.0.borrow().iter().all(|asked| asked.dropped));
    let earlier = host.0.borrow().len();
    let (content, measured) = board(false);
    let mut next = Box::pin(drawing(&host, &content, &measured));
    waits(next.as_mut());
    for late in 0..earlier {
        host.answer(late, Ok(answer(200.0)));
    }
    waits(next.as_mut());
    host.answer(earlier, Ok(answer(100.0)));
    let result = ready(next.as_mut().poll(&mut Context::from_waker(Waker::noop())));
    assert_eq!(result.unwrap().drawing.cards[0].bounds.width, 100.0);
}

/// The solves asked so far to lay the whole board, by index: whether each
/// is laid stacked, and how it wraps the block that could stack.
fn whole_solves(host: &Host) -> Vec<(usize, bool, Value)> {
    host.0
        .borrow()
        .iter()
        .enumerate()
        .filter_map(|(index, asked)| {
            let options = &asked.graph["layoutOptions"];
            let wrap = options["archboard.blocks.wrap"].as_str()?;
            let wrap = serde_json::from_str(wrap).expect("a wrap is asked for as JSON");
            Some((index, options["archboard.blocks.stacking"] == "true", wrap))
        })
        .collect()
}

/// The two wraps every partial solve below tells: a grid, then a plan.
fn candidates() -> Value {
    json!(["grid", {"lowered": {"lowered": {"out": 0, "inner": 1}, "columns": false}}])
}

/// A partial solve's reply that tells its block's wrap search, a wrap needing
/// to score more than `needed`.
fn stood_searching(needed: f64) -> String {
    let mut reply: Value = serde_json::from_str(&stood()).expect("a stood reply");
    reply["layoutOptions"]["archboard.blocks.wraps"] =
        Value::String(json!({"needed": needed, "candidates": candidates()}).to_string());
    reply.to_string()
}

/// A solve that tried one wrap alone: its drawing, where it may be kept, and
/// what the search weighs the wrap on, where it sank no card. A wrap that
/// crosses more lines scores less.
fn tried(width: Option<f64>, crossings: Option<f64>) -> String {
    let mut reply: Value = match width {
        Some(width) => serde_json::from_str(&whole(width)).expect("a whole reply"),
        None => json!({"layoutOptions": {}}),
    };
    if let Some(crossings) = crossings {
        let weighing =
            json!({"weighed": {"width": 800, "height": 600, "crossings": crossings}, "rows": 2});
        reply["layoutOptions"]["archboard.blocks.wrapped"] = Value::String(weighing.to_string());
    }
    reply.to_string()
}

/// The stacking board with both partial solves answered before the render
/// asks anything else, the plain one telling a wrap search: answers the
/// layout, waiting on the whole solve laid plain and one solve per wrap.
fn searched_at_once(
    host: &Host,
    needed: f64,
) -> Pin<Box<impl Future<Output = Result<Painted, String>> + '_>> {
    let (content, measured) = stacking_board();
    let (content, measured) = (Box::leak(Box::new(content)), Box::leak(Box::new(measured)));
    let mut drawing = Box::pin(drawing(host, content, measured));
    waits(drawing.as_mut());
    host.answer(0, Ok(stood()));
    host.answer(1, Ok(stood_searching(needed)));
    waits(drawing.as_mut());
    drawing
}

/// The layout polled once more: what it answered, which must be now.
fn answered_now<F: Future>(layout: Pin<&mut F>) -> F::Output {
    ready(layout.poll(&mut Context::from_waker(Waker::noop())))
}

#[test]
fn partial_solves_answered_at_once_ask_the_chosen_whole_and_then_each_wrap_alone() {
    let host = Host::default();
    let _drawing = searched_at_once(&host, 0.5);
    // Stood alike, the block is not stacked: only the plain way is laid
    // whole, with no wrap, and then each candidate alone, in search order.
    let wrap = |at: usize| json!({"candidate": candidates()[at], "needed": 0.5});
    assert_eq!(
        whole_solves(&host),
        [
            (2, false, Value::Null),
            (3, false, wrap(0)),
            (4, false, wrap(1))
        ]
    );
}

#[test]
fn the_wrap_the_search_keeps_draws_and_calls_off_the_whole_with_no_wrap() {
    // Whichever answers first, the wrap crossing fewer lines is kept.
    for order in [[3, 4], [4, 3]] {
        let host = Host::default();
        let mut drawing = searched_at_once(&host, 0.0001);
        for at in order {
            waits(drawing.as_mut());
            let (width, crossings) = if at == 3 { (300.0, 4.0) } else { (400.0, 1.0) };
            host.answer(at, Ok(tried(Some(width), Some(crossings))));
        }
        let drawn = answered_now(drawing.as_mut()).expect("it draws");
        assert_eq!(drawn.drawing.cards[0].bounds.width, 400.0);
        assert!(
            host.0.borrow()[2].dropped,
            "the whole with no wrap is called off"
        );
    }
}

#[test]
fn with_no_wrap_kept_the_whole_with_no_wrap_draws() {
    let host = Host::default();
    let mut drawing = searched_at_once(&host, 0.9);
    // The grid sinks a card, and the plan scores too little to be kept.
    host.answer(3, Ok(tried(None, None)));
    host.answer(4, Ok(tried(None, Some(50.0))));
    waits(drawing.as_mut());
    host.answer(2, Ok(whole(100.0)));
    let drawn = answered_now(drawing.as_mut()).expect("it draws");
    assert_eq!(drawn.drawing.cards[0].bounds.width, 100.0);
}

#[test]
fn a_failed_wrap_or_whole_answers_at_once_and_calls_off_every_solve() {
    for failed in [2, 3, 4] {
        let host = Host::default();
        let mut drawing = searched_at_once(&host, 0.5);
        host.answer(failed, Err(Unsolved::Failed("wrap failure".to_owned())));
        let polled = drawing
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()));
        host.fails(polled, "wrap failure");
    }
}

/// The stacking board laid out with both partial solves telling a wrap
/// search, answering in this order (0 stacked, 1 plain) after both ways
/// were asked whole. Answers, for each way laid whole, whether it is laid
/// stacked, how it wraps the block, and whether it was called off, in the
/// order they were asked.
fn speculated_in(order: [usize; 2]) -> Vec<(bool, Value, bool)> {
    let host = Host::default();
    let (content, measured) = stacking_board();
    let mut drawing = Box::pin(drawing(&host, &content, &measured));
    waits(drawing.as_mut());
    waits(drawing.as_mut());
    for at in order {
        host.answer(at, Ok(stood_searching(0.5)));
        waits(drawing.as_mut());
    }
    let hosted = host.0.borrow();
    whole_solves(&host)
        .into_iter()
        .map(|(index, stacked, wrap)| (stacked, wrap, hosted[index].dropped))
        .collect()
}

#[test]
fn a_partial_solve_answering_first_asks_its_wraps_and_the_way_not_chosen_is_called_off() {
    // Stood alike, the plain way is chosen. Both ways are laid whole with no
    // wrap beside the partial solves; a way's wraps are asked when its
    // partial solve answers first, else only once the choice keeps that way.
    // The way not chosen is called off, its wraps with it.
    let wrap = |at: usize| json!({"candidate": candidates()[at], "needed": 0.5});
    assert_eq!(
        speculated_in([0, 1]),
        [
            (true, Value::Null, true),
            (false, Value::Null, false),
            (true, wrap(0), true),
            (true, wrap(1), true),
            (false, wrap(0), false),
            (false, wrap(1), false),
        ]
    );
    assert_eq!(
        speculated_in([1, 0]),
        [
            (true, Value::Null, true),
            (false, Value::Null, false),
            (false, wrap(0), false),
            (false, wrap(1), false),
        ]
    );
}
