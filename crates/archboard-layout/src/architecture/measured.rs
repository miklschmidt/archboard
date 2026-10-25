//! A board's words measured, keyed by the identities the board gave them:
//! what the layout sizes each card, label and caption to.

use std::collections::BTreeMap;

use archboard_scene::drawing::{MeasuredLabel, MeasuredNode, NodeFacts};
use indexmap::IndexMap;

use crate::routes::LineLook;

/// Every measured subject of a board.
#[derive(Clone, Debug, Default)]
pub struct Measured {
    /// Each part's box and words, by id, in the board's order.
    pub nodes: IndexMap<String, MeasuredNode<NodeFacts>>,
    /// Each relationship's label, by relationship id, for those that have words.
    pub labels: IndexMap<String, MeasuredLabel>,
    /// How each line is drawn, by relationship id.
    pub lines: BTreeMap<String, LineLook>,
    /// The group each part is placed with, and each placing group's caption.
    pub groups: Option<MeasuredGroups>,
}

/// Which group places each part, and the caption each placing group is drawn with.
#[derive(Clone, Debug, Default)]
pub struct MeasuredGroups {
    /// A part's placing group, by part id, as regions gather it; a part with
    /// none is absent, as is one inside a container its group places, which
    /// stands in that group's region already.
    pub placing: IndexMap<String, String>,
    /// Each placing group's name, measured as its region caption, by group id.
    pub captions: IndexMap<String, MeasuredLabel>,
}
