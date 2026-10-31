//! A board's words measured, keyed by the identities the board gave them:
//! what the layout sizes each card and label to.

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
    /// The variant's own relationship kinds before removed comparison context changes an overview's majority kind.
    pub held_kinds: BTreeMap<String, String>,
}
