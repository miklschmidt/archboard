//! The graph fixes its nesting and entry order before one Solver call.

use super::graph::Graph;
use super::solving::{Solver, Unsolved};
use crate::blocks::choosing::has_regions;
use crate::blocks::place::{BLOCKS_NESTING, BLOCKS_PLACED, BLOCKS_PLANNED};
use archboard_scene::geometry::{Point, Rect};
use indexmap::IndexMap;
use serde::Deserialize;

/// One card's place in a solve's drawing.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedCard {
    pub(crate) id: String,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) depth: f64,
}

/// One container's place, and the header width the layout made room for.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedFrame {
    pub(crate) id: String,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) depth: f64,
    #[serde(default)]
    pub(crate) header: Option<usize>,
}

/// One group region's place and its caption's.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedRegion {
    pub(crate) group: String,
    #[serde(default)]
    pub(crate) parent: Option<String>,
    #[serde(rename = "box")]
    pub(crate) bounds: Rect,
    pub(crate) caption: Rect,
    pub(crate) depth: f64,
}

/// One relationship's route and its label's place.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PlacedEdge {
    pub(crate) id: String,
    pub(crate) points: Vec<Point>,
    #[serde(default)]
    pub(crate) label: Option<Rect>,
}

/// A whole drawing's geometry, as a solve answers it.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Placed {
    #[serde(skip)]
    pub(crate) planned: bool,
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) cards: Vec<PlacedCard>,
    pub(crate) frames: Vec<PlacedFrame>,
    pub(crate) regions: Vec<PlacedRegion>,
    pub(crate) edges: Vec<PlacedEdge>,
}

/// The root options of the Solver's answer.
#[derive(Deserialize)]
struct Told {
    #[serde(default, rename = "layoutOptions")]
    options: IndexMap<String, String>,
}

/// Lay one graph out with group nesting fixed by membership.
pub(crate) async fn placed_blocks<S: Solver>(
    solver: &S,
    graph: &Graph,
    inline: bool,
) -> Result<Placed, String> {
    let nesting = if !inline {
        "blocks"
    } else if has_regions(&graph.with_options(&[]))? {
        "groups"
    } else {
        "inline"
    };
    let reply = solver
        .solve(graph.with_options(&[(BLOCKS_NESTING, nesting.to_owned())]))
        .await
        .map_err(|error| match error {
            Unsolved::Failed(words) => words,
            Unsolved::CalledOff => "The layout solve was called off.".to_owned(),
        })?;
    let Told { mut options } = serde_json::from_str(&reply)
        .map_err(|error| format!("A solve's answer is unreadable: {error}"))?;
    let placed = options
        .swap_remove(BLOCKS_PLACED)
        .ok_or_else(|| "A solve asked for a drawing answered none.".to_owned())?;
    let mut placed: Placed = serde_json::from_str(&placed)
        .map_err(|error| format!("A solve's drawing is unreadable: {error}"))?;
    placed.planned = options
        .get(BLOCKS_PLANNED)
        .is_some_and(|value| value == "true");
    Ok(placed)
}
