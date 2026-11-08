//! Route legacy Blocks placements through owned fans and guarded channels.

// A bounded readability search keeps dense solves within their render budget.
const REFINEMENT_LIMIT: usize = 32;
// Medium views also need placement alternatives; large pictures keep one routed candidate.
const PLACEMENT_REFINEMENT_LIMIT: usize = 64;

mod channel;
mod choices;
mod clearance;
mod compact;
mod corridors;
mod dense;
mod endpoint_choices;
mod fallback;
mod geometry;
mod hierarchy;
mod junctions;
mod label_space;
mod lanes;
mod model;
mod port_spacing;
mod portals;
mod ports;
mod reading;
mod room;
mod runs;
mod shape;
mod swaps;
mod topology;
mod words;

fn relationships(graph: &crate::graph::Node) -> usize {
    graph.edges.as_deref().unwrap_or_default().len()
}

/// How many guarded drawings a view compares before it keeps the best.
fn comparison(graph: &crate::graph::Node) -> usize {
    let count = relationships(graph);
    if count <= REFINEMENT_LIMIT {
        usize::MAX
    } else if count <= PLACEMENT_REFINEMENT_LIMIT {
        2
    } else {
        1
    }
}

/// Whether the wider placement search can run. A view beyond the readability
/// limit keeps its first hierarchy once that draws, because the wider search
/// costs more than its render budget. A refused view still needs it.
pub(super) fn widens(graph: &crate::graph::Node, drawn: bool, complete_repair: bool) -> bool {
    if drawn {
        relationships(graph) <= REFINEMENT_LIMIT
    } else {
        complete_repair || relationships(graph) <= PLACEMENT_REFINEMENT_LIMIT
    }
}

#[derive(Debug)]
pub(super) struct Refused {
    pub message: String,
    /// Endpoint pairs, with the latest refused relationship first.
    pub blocked: Vec<[String; 2]>,
}
impl From<String> for Refused {
    fn from(message: String) -> Self {
        Self {
            message,
            blocked: Vec::new(),
        }
    }
}
impl From<&str> for Refused {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}

pub(super) use words::{dress, without_trunk_words};

mod fixed;
/// Rank guarded candidates against one fixed reference, so an intermediate
/// winner cannot tighten the area budget of the remaining candidates.
pub(super) fn route_candidates(
    graph: &crate::graph::Node,
    mut candidates: crate::blocks::legacy::Candidates<'_>,
) -> Result<Result<crate::blocks::assembly::Placed, Refused>, String> {
    let mut failure = Refused::from("No guarded Blocks drawing");
    let mut reference = None;
    let mut best = None;
    let mut score = (usize::MAX, u64::MAX);
    let mut drawn = 0;
    while let Some(drawing) = candidates.next(reference.is_some())? {
        // The other route orders rescue a view that has no drawing yet.
        let orders = if reference.is_some() {
            &selection::ORDERS[..1]
        } else {
            &selection::ORDERS[..]
        };
        match fixed::route(graph, drawing, orders) {
            Ok(next) => {
                let next_score = reading::drawn_rank(&next);
                let first = reference.get_or_insert_with(|| next.clone());
                if next_score < score && reading::worth_placing(&next, first, graph) {
                    score = next_score;
                    best = Some(next);
                }
                drawn += 1;
                if drawn == comparison(graph) {
                    break;
                }
            }
            Err(mut error) => {
                // A placement repair must address every failed candidate.
                error.blocked.extend(failure.blocked);
                failure = error;
            }
        }
    }
    Ok(best.ok_or(failure))
}

/// Past this many lines a reading starts with more room between its cells.
const AMPLE_LINES: usize = 40;

/// The room a dense placement of some lines adds to its gaps, tightest first: a crowded
/// reading starts wider. Lines between frames all cross the band between them, so several
/// frames need more.
fn dense_rooms(lines: usize, frames: usize) -> &'static [f64] {
    match (lines, frames) {
        (0..=15, 0..=1) => &[0.0, 48.0],
        (16..=AMPLE_LINES, 0..=1) => &[72.0, 120.0],
        (0..=AMPLE_LINES, _) => &[72.0, 120.0, 288.0],
        (41..=64, 0..=1) => &[96.0],
        (41..=64, _) => &[96.0, 288.0, 480.0],
        (_, 0..=1) => &[288.0],
        _ => &[480.0, 640.0],
    }
}

/// The rooms a reading goes on to while its own rooms draw nothing.
const WIDER_ROOMS: [f64; 7] = [144.0, 192.0, 288.0, 384.0, 480.0, 640.0, 800.0];

/// The best dense drawing of a reading, if one passes every guard. Every placement at every
/// room of the reading is routed, because what a placement promises before it is routed
/// misses the crossings, detours and labels of its lines. A wider room runs only while no
/// drawing passes, because even a drawing with more room than it needs reads far better
/// than a Graphviz placement.
pub(super) fn dense_drawing(graph: &crate::graph::Node) -> Option<crate::blocks::assembly::Placed> {
    let grids = dense::Grids::of(graph)?;
    let mut best = None;
    let rooms = dense_rooms(relationships(graph), dense::frames(graph));
    for &room in rooms {
        dense_room(graph, &grids, room, &mut best);
    }
    let widest = rooms.last().copied().unwrap_or_default();
    for &room in WIDER_ROOMS.iter().filter(|&&room| room > widest) {
        if best.is_some() {
            break;
        }
        dense_room(graph, &grids, room, &mut best);
    }
    best.map(|(_, drawing)| drawing)
}

/// Route every placement of a reading at one room, and keep the best drawing so far.
fn dense_room(
    graph: &crate::graph::Node,
    grids: &dense::Grids<'_>,
    room: f64,
    best: &mut Option<(reading::Order, crate::blocks::assembly::Placed)>,
) {
    let routed = dense::drawings(grids, room)
        .into_iter()
        .filter_map(|drawing| fixed::route(graph, drawing, &selection::ORDERS[..1]).ok());
    for next in routed {
        let order = reading::order(&next);
        if best.as_ref().is_none_or(|one| order < one.0) {
            *best = Some((order, next));
        }
    }
}

mod direct;

mod trunks;
pub(super) fn route_trunks(scene: &archboard_router::Scene) -> Vec<archboard_router::Route> {
    trunks::route(scene)
}

mod route_labels;

mod repair;
mod selection;
