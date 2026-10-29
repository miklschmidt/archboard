//! Route legacy Blocks placements through owned fans and guarded channels.

// A bounded readability search keeps dense solves within their render budget.
const REFINEMENT_LIMIT: usize = 32;
// Medium views also need placement alternatives; large boards keep one routed candidate.
const PLACEMENT_REFINEMENT_LIMIT: usize = 64;

mod channel;
mod choices;
mod clearance;
mod corridors;
mod endpoint_choices;
mod fallback;
mod geometry;
mod hierarchy;
mod junctions;
mod label_space;
mod lanes;
mod model;
mod points;
mod port_spacing;
mod portals;
mod ports;
mod reading;
mod runs;
mod shape;
mod topology;

pub(super) fn refines(graph: &crate::graph::Node) -> bool {
    graph.edges.as_deref().unwrap_or_default().len() <= PLACEMENT_REFINEMENT_LIMIT
}

#[derive(Debug)]
pub(super) struct Refused {
    pub message: String,
    pub blocked: Vec<String>,
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

mod fixed;
/// Rank guarded candidates against one fixed reference, so an intermediate
/// winner cannot tighten the area budget of the remaining candidates.
pub(super) fn route_candidates(
    graph: &crate::graph::Node,
    candidates: impl Iterator<Item = crate::blocks::assembly::Placed>,
) -> Result<crate::blocks::assembly::Placed, Refused> {
    let mut failure = Refused::from("No guarded Blocks drawing");
    let mut reference = None;
    let mut best = None;
    let mut score = (usize::MAX, u64::MAX);
    for drawing in candidates {
        match fixed::route(graph, drawing) {
            Ok(next) => {
                if !refines(graph) {
                    return Ok(next);
                }
                let next_score = reading::rank(&next.edges);
                let first = reference.get_or_insert_with(|| next.clone());
                if next_score < score && reading::worth_placing(&next, first, graph) {
                    score = next_score;
                    best = Some(next);
                }
            }
            Err(error) => failure = error,
        }
    }
    best.ok_or(failure)
}

mod direct;

mod trunks;
pub(super) fn route_trunks(scene: &archboard_router::Scene) -> Vec<archboard_router::Route> {
    trunks::route(scene)
}

mod route_labels;

mod repair;
mod selection;
