//! The critical path of each first render: the longest chain of solves in
//! which one is asked only after another answered, when every solve has a
//! worker of its own (docs/design/first-render-critical-path.md).
//!
//! `packages/renderer/tests/runtime/support/capture-render-requests.ts` writes
//! the render request of each board `timing.ts` times. This draws each one
//! again with a native build of the core and its own Graphviz (ADR 0060). Each
//! solve is laid out when it is asked, timed, and its Graphviz calls timed
//! apart. A solve answers on a clock that starts when it is asked and runs for
//! as long as it took, and the render goes on as it would when the earliest
//! answer came. A solve the render dropped answers nothing.
//!
//! Run, inside `nix develop`:
//!
//! ```text
//! cargo run --release -p archboard-render --example critical_path -- <requests dir> [rounds] [board ...]
//! ```
//!
//! Each board is drawn `rounds` times (3 by default), and the round with the
//! shortest path is printed: its solves, their time with the time Graphviz
//! took of it, the time of solves the render dropped, the critical path, the
//! render's own time beside its solves, and the chain of solves on the path.

use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;
use std::future::Future;
use std::pin::{Pin, pin};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::task::{Context, Poll, Wake, Waker};
use std::time::Instant;
use std::{env, fs};

use archboard_graphviz::InCore;
use archboard_layout::{Calling, Graphviz, Solver, Unsolved, lay_out_board};
use archboard_render::request::RenderRequest;
use archboard_render::{Host, Renderer};
use serde::Deserialize;

/// What the core was asked for one first render.
#[derive(Deserialize)]
struct Captured {
    name: String,
    request: String,
    icons: BTreeMap<String, Vec<String>>,
}

/// Milliseconds since `started`.
fn ms_since(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1000.0
}

/// The core's Graphviz, the time of each call added to `spent`.
struct Timed<'a>(&'a Cell<f64>);

impl Graphviz for Timed<'_> {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        let started = Instant::now();
        let answer = InCore.render(graph);
        self.0.set(self.0.get() + ms_since(started));
        answer
    }
}

/// One solve the render asked for.
struct Asked {
    /// The way its root options lay the board out.
    way: String,
    /// When it was asked.
    at: f64,
    /// The solve answered last before it was asked.
    after: Option<usize>,
    /// What it took, and what Graphviz took of that.
    ms: f64,
    graphviz_ms: f64,
    answer: Option<Result<String, Unsolved>>,
    answered: Option<f64>,
    dropped: bool,
}

impl Asked {
    fn waiting(&self) -> bool {
        self.answered.is_none() && !self.dropped
    }
}

/// The clock of one render: now, the solve answered last, and every solve.
#[derive(Default)]
struct Clock {
    now: f64,
    last: Option<usize>,
    solves: Vec<Asked>,
}

/// Where a first render runs again: each solve laid out when asked, answered
/// when the clock reaches its end.
struct Clocked {
    clock: RefCell<Clock>,
    icons: BTreeMap<String, Vec<String>>,
}

/// The root options of a graph that name the way a solve lays it out.
fn way_of(graph: &str) -> String {
    let options = serde_json::from_str::<serde_json::Value>(graph)
        .ok()
        .and_then(|graph| graph.get("layoutOptions").cloned())
        .unwrap_or_default();
    let Some(options) = options.as_object() else {
        return String::new();
    };
    options
        .iter()
        .filter_map(|(key, value)| {
            let key = key.strip_prefix("archboard.blocks.")?;
            Some(format!(
                "{key}={}",
                value
                    .as_str()
                    .map_or_else(|| value.to_string(), str::to_owned)
            ))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

impl Solver for Clocked {
    type Solve<'s> = Answer<'s>;

    fn solve(&self, graph: String, _: &Calling) -> Answer<'_> {
        let spent = Cell::new(0.0);
        let started = Instant::now();
        let answer = lay_out_board(&graph, &mut Timed(&spent)).map_err(Unsolved::Failed);
        let ms = ms_since(started);
        let mut clock = self.clock.borrow_mut();
        let asked = Asked {
            way: way_of(&graph),
            at: clock.now,
            after: clock.last,
            ms,
            graphviz_ms: spent.get(),
            answer: Some(answer),
            answered: None,
            dropped: false,
        };
        clock.solves.push(asked);
        Answer {
            clock: &self.clock,
            index: clock.solves.len() - 1,
        }
    }
}

impl Host for Clocked {
    fn icons(&self, names: &[&str]) -> Result<BTreeMap<String, Vec<String>>, String> {
        Ok(names
            .iter()
            .filter_map(|name| Some(((*name).to_owned(), self.icons.get(*name)?.clone())))
            .collect())
    }
}

/// One solve, ready once the clock answered it.
struct Answer<'s> {
    clock: &'s RefCell<Clock>,
    index: usize,
}

impl Future for Answer<'_> {
    type Output = Result<String, Unsolved>;

    fn poll(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
        let mut clock = self.clock.borrow_mut();
        let solve = &mut clock.solves[self.index];
        if solve.answered.is_none() {
            return Poll::Pending;
        }
        Poll::Ready(solve.answer.take().expect("an answer is taken once"))
    }
}

impl Drop for Answer<'_> {
    fn drop(&mut self) {
        let mut clock = self.clock.borrow_mut();
        let solve = &mut clock.solves[self.index];
        solve.dropped = solve.answered.is_none();
    }
}

/// Whether the render asked to be polled again.
#[derive(Default)]
struct Woken(AtomicBool);

impl Wake for Woken {
    fn wake(self: Arc<Self>) {
        self.0.store(true, Ordering::Relaxed);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.0.store(true, Ordering::Relaxed);
    }
}

/// One first render, drawn on the clock: its solves and how long it took.
fn first_render(captured: &Captured) -> Result<(Clock, f64), String> {
    let request: RenderRequest =
        serde_json::from_str(&captured.request).map_err(|error| error.to_string())?;
    let host = Clocked {
        clock: RefCell::default(),
        icons: captured.icons.clone(),
    };
    let woken = Arc::new(Woken::default());
    let waker = Waker::from(Arc::clone(&woken));
    let mut context = Context::from_waker(&waker);
    let renderer = Renderer::default();
    let started = Instant::now();
    {
        let mut render = pin!(renderer.render(&request, &host));
        loop {
            if let Poll::Ready(rendered) = render.as_mut().poll(&mut context) {
                rendered?;
                break;
            }
            if woken.0.swap(false, Ordering::Relaxed) {
                continue;
            }
            let mut clock = host.clock.borrow_mut();
            let next = (0..clock.solves.len())
                .filter(|&at| clock.solves[at].waiting())
                .min_by(|&one, &other| {
                    let end = |at: usize| clock.solves[at].at + clock.solves[at].ms;
                    end(one).total_cmp(&end(other))
                })
                .ok_or("the render waits on no solve")?;
            let at = clock.solves[next].at + clock.solves[next].ms;
            clock.now = at;
            clock.last = Some(next);
            clock.solves[next].answered = Some(at);
        }
    }
    let wall = ms_since(started);
    Ok((host.clock.into_inner(), wall))
}

/// The solves on the critical path, first to last.
fn chain(clock: &Clock) -> Vec<usize> {
    let mut chain = Vec::new();
    let mut at = clock.last;
    while let Some(index) = at {
        chain.push(index);
        at = clock.solves[index].after;
    }
    chain.reverse();
    chain
}

#[expect(clippy::print_stdout, reason = "the example reports its times")]
fn main() -> Result<(), String> {
    let arguments: Vec<String> = env::args().skip(1).collect();
    let directory = arguments.first().ok_or("name the requests directory")?;
    // A number after the directory is the rounds, and every other word a board.
    let rounds: Option<usize> = arguments.get(1).and_then(|rounds| rounds.parse().ok());
    let only = &arguments[arguments.len().min(1 + usize::from(rounds.is_some()))..];
    let rounds = rounds.unwrap_or(3);
    let mut files: Vec<_> = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| Some(entry.ok()?.path()))
        .collect();
    files.sort();
    let mut total = 0.0;
    for file in files {
        let captured: Captured =
            serde_json::from_str(&fs::read_to_string(&file).map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        if !only.is_empty() && !only.contains(&captured.name) {
            continue;
        }
        let mut best: Option<(Clock, f64)> = None;
        for _ in 0..rounds.max(1) {
            let drawn = first_render(&captured)?;
            if best.as_ref().is_none_or(|kept| drawn.0.now < kept.0.now) {
                best = Some(drawn);
            }
        }
        let (clock, wall) = best.expect("a board is drawn at least once");
        total += clock.now;
        report(&captured.name, &clock, wall);
    }
    println!("critical path, boards drawn: {total:.0} ms");
    Ok(())
}

/// One board's line, and the chain of solves on its path.
#[expect(clippy::print_stdout, reason = "the example reports its times")]
fn report(name: &str, clock: &Clock, wall: f64) {
    let (mut solved, mut graphviz, mut dropped) = (0.0, 0.0, 0.0);
    for solve in &clock.solves {
        solved += solve.ms;
        graphviz += solve.graphviz_ms;
        if solve.dropped {
            dropped += solve.ms;
        }
    }
    println!(
        "{name:<24} solves {:>3}  cpu {solved:>6.0} ms (graphviz {graphviz:>5.0}, dropped {dropped:>5.0})  critical path {:>5.0} ms  render beside solves {:>4.0} ms",
        clock.solves.len(),
        clock.now,
        wall - solved,
    );
    for index in chain(clock) {
        let solve = &clock.solves[index];
        println!(
            "    #{index:<3} asked {:>5.0}  {:>5.0} ms (graphviz {:>4.0})  {}",
            solve.at, solve.ms, solve.graphviz_ms, solve.way
        );
    }
}
