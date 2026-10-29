//! Route legacy Blocks placements through owned fans and guarded channels.

mod channel;
mod choices;
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
mod portals;
mod ports;
mod runs;
mod shape;
mod topology;

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
pub(super) fn route_fixed(
    graph: &crate::graph::Node,
    drawing: crate::blocks::assembly::Placed,
) -> Result<crate::blocks::assembly::Placed, Refused> {
    fixed::route(graph, drawing)
}

mod direct;

mod trunks;
pub(super) fn route_trunks(scene: &archboard_router::Scene) -> Vec<archboard_router::Route> {
    trunks::route(scene)
}

mod route_labels;

mod repair;
mod selection;
