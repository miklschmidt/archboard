//! The crossing pass every architecture drawing takes after layout
//! (`shared/rules/layout/routes`): a fan whose lanes cross is put in order
//! (`fans`) and a crossing folded into two corners moves onto straight runs
//! (`folded`), and then one line hops each crossing
//! where a hop fits, or the two cross plainly (`crossings`). The lines a reader
//! sees and the straight runs a hop stands on are `drawn_lines`; where a hop
//! may stand and what it draws is `hops`.

mod clearance;
mod clusters;
mod crossings;
mod drawn_lines;
mod fans;
mod folded;
mod hops;

#[cfg(test)]
mod tests;

use archboard_scene::request::{Arrowhead, Dash};
use serde::{Deserialize, Serialize};

pub use crossings::{bridge_crossings, bridge_unfolded};
pub use folded::unfold_crossings;

/// How a relationship's line is drawn: its dash and its head, as the vault's
/// policy draws its kind.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineLook {
    /// The line's dash pattern.
    pub dash: Dash,
    /// The head the line ends in.
    pub arrowhead: Arrowhead,
}

// The distances of `shared/constants/spacing.ts` that only this pass keeps.

/// How far a hop reaches along its line from the crossing to either foot.
const BRIDGE_RADIUS: f64 = 7.0;
/// Clear space a hop keeps from other ink.
const BRIDGE_CLEARANCE: f64 = 3.0;
/// Label-to-route whitespace.
const LABEL_ROUTE_CLEARANCE: f64 = 12.0;
/// Whitespace a route keeps from a card it does not enter.
const ROUTE_OBSTACLE_CLEARANCE: f64 = 8.0;
/// The distance between neighbouring lanes.
const ROUTE_LANE: f64 = 16.0;
