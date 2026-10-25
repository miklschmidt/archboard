//! A board's words, measured in one call before its layout places anything:
//! each card's and container's, each relationship's label and each group's
//! caption.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::drawing::{MeasuredLabel, MeasuredNode};
use crate::measure::{CardWords, measure_caption, measure_label, measure_node};

/// The words of one card or container.
#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NodeWords {
    /// Its name.
    pub name: String,
    /// What it is responsible for, when it says.
    #[serde(default)]
    #[ts(optional)]
    pub responsibility: Option<String>,
    /// Whether it opens another board.
    pub drills: bool,
    /// Whether other subjects name it as their parent.
    pub container: bool,
}

/// A board's words, in the order its layout reads them.
#[derive(Clone, Debug, Deserialize, TS)]
pub struct BoardWords {
    /// Each card's and container's words.
    pub nodes: Vec<NodeWords>,
    /// Each relationship's label.
    pub labels: Vec<String>,
    /// Each placing group's name.
    pub captions: Vec<String>,
}

/// A board's words measured, each in the order it was asked for. A node's
/// measure names no node: the host holds the nodes.
#[derive(Clone, Debug, Serialize, TS)]
pub struct MeasuredWords {
    /// Each card's and container's box and words.
    pub nodes: Vec<MeasuredNode<()>>,
    /// Each label on its plate.
    pub labels: Vec<MeasuredLabel>,
    /// Each caption on its tab.
    pub captions: Vec<MeasuredLabel>,
}

/// A board's words measured.
pub fn measure_board(words: &BoardWords) -> MeasuredWords {
    MeasuredWords {
        nodes: words
            .nodes
            .iter()
            .map(|node| {
                let card = CardWords {
                    name: &node.name,
                    responsibility: node.responsibility.as_deref(),
                    drills: node.drills,
                };
                measure_node((), &card, node.container)
            })
            .collect(),
        labels: words
            .labels
            .iter()
            .map(|words| measure_label(words))
            .collect(),
        captions: words
            .captions
            .iter()
            .map(|name| measure_caption(name))
            .collect(),
    }
}
