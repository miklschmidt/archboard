//! Replays the solves of recorded first renders through a native build of the
//! core's layout, answering each solve's Graphviz from the recording, and
//! times the core's own work. In a first round that is not timed, each solve
//! must ask Graphviz for the graphs it asked when recorded and answer what it
//! answered then, byte for byte; each round after it is timed, and the
//! fastest of them is reported.
//!
//! `packages/renderer/tests/runtime/support/capture-solves.ts` records the
//! solves. A release build with line tables suits a profiler:
//!
//! ```text
//! CARGO_PROFILE_RELEASE_DEBUG=line-tables-only cargo run --release \
//!     -p archboard-layout --example replay -- <capture dir> [rounds] [board ...]
//! ```
//!
//! docs/design/first-render-critical-path.md says what it measured.

use std::fs;
use std::time::Instant;

use archboard_layout::{Graphviz, lay_out_board};
use serde::Deserialize;
use serde_json::Value;

/// One graph a solve's Graphviz laid out, and what it answered.
#[derive(Deserialize)]
struct Render {
    graph: Value,
    answer: String,
}

/// One recorded solve.
#[derive(Deserialize)]
struct Solve {
    graph: String,
    answer: String,
    renders: Vec<Render>,
}

/// One recorded first render.
#[derive(Deserialize)]
struct Recording {
    name: String,
    solves: Vec<Solve>,
}

/// A solve's Graphviz, answering from the recording, and holding each graph
/// it is asked to the recorded one when it checks.
struct Recorded<'a> {
    renders: std::slice::Iter<'a, Render>,
    checks: bool,
}

impl Graphviz for Recorded<'_> {
    fn render(&mut self, graph: &str) -> Result<String, String> {
        let render = self
            .renders
            .next()
            .ok_or("the solve asked Graphviz for more graphs than it did when recorded")?;
        if self.checks {
            let asked: Value = serde_json::from_str(graph).map_err(|error| error.to_string())?;
            if asked != render.graph {
                return Err("the solve asked Graphviz for another graph".to_owned());
            }
        }
        Ok(render.answer.clone())
    }
}

/// Every recording in a directory, of the boards named, or of all when none is.
fn recordings(dir: &str, only: &[String]) -> Result<Vec<Recording>, String> {
    let mut files: Vec<_> = fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect();
    files.sort();
    let mut read = Vec::new();
    for file in &files {
        let recording: Recording =
            serde_json::from_str(&fs::read_to_string(file).map_err(|error| error.to_string())?)
                .map_err(|error| format!("{}: {error}", file.display()))?;
        if only.is_empty() || only.contains(&recording.name) {
            read.push(recording);
        }
    }
    Ok(read)
}

/// Lay one recorded solve out again, and say how long the core took.
fn replayed(name: &str, index: usize, solve: &Solve, checks: bool) -> Result<f64, String> {
    let mut graphviz = Recorded {
        renders: solve.renders.iter(),
        checks,
    };
    let started = Instant::now();
    let answer = lay_out_board(&solve.graph, &mut graphviz)
        .map_err(|error| format!("{name} solve {index}: {error}"))?;
    let ms = started.elapsed().as_secs_f64() * 1000.0;
    if answer != solve.answer {
        return Err(format!("{name} solve {index} answered another drawing"));
    }
    if graphviz.renders.next().is_some() {
        return Err(format!(
            "{name} solve {index} asked Graphviz for fewer graphs"
        ));
    }
    Ok(ms)
}

#[expect(clippy::print_stdout, reason = "the example reports its times")]
fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let dir = args.next().ok_or("name the capture directory")?;
    let rounds: usize = args
        .next()
        .map_or(Ok(1), |rounds| rounds.parse())
        .map_err(|error| format!("rounds: {error}"))?;
    let only: Vec<String> = args.collect();
    let mut total = 0.0;
    for recording in &recordings(&dir, &only)? {
        let mut times = vec![f64::INFINITY; recording.solves.len()];
        for round in 0..=rounds {
            for (index, solve) in recording.solves.iter().enumerate() {
                let ms = replayed(&recording.name, index, solve, round == 0)?;
                if round > 0 {
                    times[index] = times[index].min(ms);
                }
            }
        }
        let sum: f64 = times.iter().sum();
        total += sum;
        let each: Vec<String> = times.iter().map(|ms| format!("{ms:.0}")).collect();
        println!("{:<24} {sum:>7.1} ms  [{}]", recording.name, each.join(" "));
    }
    println!("{:<24} {total:>7.1} ms", "total");
    Ok(())
}
