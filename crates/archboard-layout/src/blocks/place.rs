//! Parse one measured hierarchy and dispatch without changing the Solver contract.

use indexmap::IndexMap;
use serde::Deserialize;

use super::planned::{Routed, Split, Step};
use crate::{Graphviz, graph::Node, json::J};

/// The root option carrying the placed drawing.
const BLOCKS_PLACED: &str = "archboard.blocks.placed";
/// Whether this solve owns the final route coordinates.
const BLOCKS_PLANNED: &str = "archboard.blocks.planned";
/// The root option naming the engine, present for Lanes alone: a graph without it is Blocks.
const ENGINE: &str = "archboard.layout.engine";

/// Whether a graph asks for Lanes: the lanes' placement, never planned.
fn lanes(graph: &Node) -> bool {
    graph.option(ENGINE) == Some("lanes")
}

/// The drawing a solve's answer carries in its root options, and whether the solve owns its
/// final route coordinates; none when it carries no drawing.
pub(crate) fn told_drawing(options: &mut IndexMap<String, String>) -> Option<(String, bool)> {
    let placed = options.swap_remove(BLOCKS_PLACED)?;
    let planned = options
        .get(BLOCKS_PLANNED)
        .is_some_and(|value| value == "true");
    Some((placed, planned))
}

/// A solve's answer: the hierarchy's root, as large as the drawing, carrying it in its options.
fn answer(graph: &Node, width: f64, height: f64, told: Vec<(&str, String)>) -> String {
    let mut options = graph.layout_options.clone().unwrap_or_default();
    options.shift_remove(BLOCKS_PLANNED);
    for (name, value) in told {
        options.insert(name.to_owned(), value);
    }
    J::obj([
        ("id", J::str(&graph.id)),
        ("x", J::Num(0.0)),
        ("y", J::Num(0.0)),
        ("width", J::Num(width)),
        ("height", J::Num(height)),
        (
            "layoutOptions",
            J::Obj(
                options
                    .into_iter()
                    .map(|(name, value)| (name, J::Str(value)))
                    .collect(),
            ),
        ),
    ])
    .text()
}

/// Lay out a measured hierarchy through one solver call.
///
/// # Errors
///
/// An unreadable graph, a Lanes request for a split part, or a refusal from Graphviz.
pub fn lay_out_picture(graph: &str, host: &mut dyn Graphviz) -> Result<String, String> {
    let unreadable =
        |error: serde_json::Error| format!("The measured graph is unreadable: {error}");
    let asked: Option<Asked> = if graph.starts_with(PART) {
        Some(serde_json::from_str(graph).map_err(unreadable)?)
    } else {
        None
    };
    let graph: Node = serde_json::from_str(graph).map_err(unreadable)?;
    // Either engine lays a graph out with each door as wide as its lines' heads need.
    let graph = super::planned::doors_widened(&graph);
    if let Some(Asked { part }) = asked {
        if lanes(&graph) {
            return Err("Lanes does not solve in parts.".to_owned());
        }
        return super::planned::solve_part(&graph, &part);
    }
    // Lanes is Blocks' fallback: Blocks takes it for a reading that no placement gives every
    // line a clear planned channel (TASK-624), and Lanes takes it always. The drawing settles
    // its routes. It draws no line's words and keeps no room for them: the selection still
    // names each line.
    let planned = if lanes(&graph) {
        None
    } else {
        hybrid(&graph, host)?
    };
    let (placed, frozen) = if let Some(placed) = planned {
        (placed, true)
    } else {
        let quiet = super::planned::without_words(&graph, |_| true);
        (super::legacy::place(&quiet, host)?, false)
    };
    let mut told = vec![(BLOCKS_PLACED, placed.json().text())];
    if frozen {
        told.push((BLOCKS_PLANNED, "true".to_owned()));
    }
    Ok(answer(&graph, placed.width, placed.height, told))
}

/// How the graph of a part of a split solve starts: the part, named first on its root.
const PART: &str = "{\"part\":";

/// The part of a split solve that a graph asks for, as the core wrote it.
#[derive(Deserialize)]
struct Asked {
    part: String,
}

/// The graph of one part of a split solve: the solve's graph, with the part named first on its
/// root.
pub(crate) fn with_part(graph: &str, part: &str) -> String {
    let rest = graph.trim_start().strip_prefix('{').unwrap_or_default();
    format!("{PART}{},{rest}", J::str(part).text())
}

/// A Blocks solve in parts, which the host's workers solve side by side (ADR 0078): the graph,
/// and the split solve of the drawing it chooses now. The answer is the answer of one solve.
pub(crate) struct Across {
    graph: Node,
    split: Split,
}

/// What a solve in parts does next.
pub(crate) enum Next {
    /// Ask for these parts, each by what `with_part` names on the graph.
    Ask(Vec<String>),
    /// Solve the graph in one solve: its drawing takes no dense placement.
    Whole,
    /// The solve's answer.
    Answer(String),
}

impl Across {
    /// The solve in parts of a Blocks graph that takes a dense placement.
    pub(crate) fn of(graph: &str) -> Option<Across> {
        let graph: Node = serde_json::from_str(graph).ok()?;
        if lanes(&graph) {
            return None;
        }
        let graph = super::planned::doors_widened(&graph);
        let quiet = super::planned::without_trunk_words(&graph);
        let plain = quiet.is_none();
        let split = Split::of(quiet.unwrap_or_else(|| graph.clone()), plain)?;
        Some(Across { graph, split })
    }

    /// What to do next, from what the parts answered so far.
    pub(crate) fn next(&mut self) -> Next {
        loop {
            match self.split.step() {
                Step::Ask(parts) => return Next::Ask(parts),
                Step::Done(Some(Routed {
                    told: Some(told), ..
                })) => {
                    let (width, height) = (f64::from_bits(told.width), f64::from_bits(told.height));
                    let told = vec![
                        (BLOCKS_PLACED, told.placed),
                        (BLOCKS_PLANNED, "true".to_owned()),
                    ];
                    return Next::Answer(answer(&self.graph, width, height, told));
                }
                // The drawing without its trunks' words cannot wear them, so the graph is drawn
                // with them, as `hybrid` draws it.
                Step::Done(Some(_)) if !self.split.plain() => {
                    match Split::of(self.graph.clone(), true) {
                        Some(split) => self.split = split,
                        None => return Next::Whole,
                    }
                }
                // No dense drawing passes: one solve places the graph with Graphviz.
                Step::Done(_) => return Next::Whole,
            }
        }
    }

    /// Keep what a part answered.
    ///
    /// # Errors
    ///
    /// A part or an answer that does not read.
    pub(crate) fn take(&mut self, part: &str, answer: &str) -> Result<(), String> {
        self.split.take(part, answer)
    }
}

/// A planned drawing, or none when the planner refuses every placement; an error is a Graphviz
/// failure.
type Planned = Result<Option<super::assembly::Placed>, String>;

/// A door's lines share a trunk, which their words would hold apart, so they are drawn
/// without them first, and each then wears them on its own branch.
fn hybrid(graph: &Node, host: &mut dyn Graphviz) -> Planned {
    let Some(quiet) = super::planned::without_trunk_words(graph) else {
        return solved(graph, host);
    };
    let Some(drawing) = solved(&quiet, host)? else {
        return Ok(None);
    };
    super::planned::dress(graph, drawing)
        .map_or_else(|_| solved(graph, host), |dressed| Ok(Some(dressed)))
}

fn solved(graph: &Node, host: &mut dyn Graphviz) -> Planned {
    if let Some(drawing) = super::planned::dense_drawing(graph) {
        return Ok(Some(drawing));
    }
    let mut room = Vec::new();
    let mut complete_room = Vec::new();
    // Preserve every drawing the original bounded attempts already find. Only
    // a complete refusal uses all blockage feedback and enclosing channels.
    for (extra, complete) in [
        (0.0, false),
        (32.0, false),
        (64.0, false),
        (32.0, true),
        (64.0, true),
        (128.0, true),
        (256.0, true),
    ] {
        let endpoints = if complete { &complete_room } else { &room };
        let failure = match try_placements(graph, host, endpoints, extra, complete)? {
            Ok(drawing) => return Ok(Some(drawing)),
            Err(failure) => failure,
        };
        let Some(latest) = failure.blocked.first() else {
            break;
        };
        if !complete {
            room.extend(latest.iter().cloned());
            room.sort();
            room.dedup();
        }
        // Start the complete repair from the original placement's full feedback,
        // independently of which endpoints the narrow repairs encounter later.
        if extra == 0.0 || complete {
            complete_room.extend(failure.blocked.iter().flatten().cloned());
            complete_room.sort();
            complete_room.dedup();
        }
    }
    Ok(None)
}

fn try_placements(
    graph: &Node,
    host: &mut dyn Graphviz,
    room: &[String],
    extra: f64,
    complete: bool,
) -> Result<Result<super::assembly::Placed, super::planned::Refused>, String> {
    super::planned::route_candidates(
        graph,
        super::legacy::candidates(graph, host, room, extra, complete)?,
    )
}
